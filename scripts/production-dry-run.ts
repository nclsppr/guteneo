import { pathToFileURL } from "node:url";
import { dispatchValidationResultSchema } from "../packages/contracts/src/dispatch-validation";

const origin = "https://guteneo.com";
const checkIds = [
  "prepared_state",
  "submission_not_started",
  "quote",
  "protected_document",
  "recipient_suppression",
  "acceptance",
  "provider_delivery",
];
export type DryRunInput = {
  dispatchIds: string[];
  token: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

/** Bounded authenticated GETs only. Never prepares, renews, approves or sends. */
export async function inspectProductionDispatches(input: DryRunInput) {
  if (!input.token || input.token.length > 16384 || /\s/.test(input.token))
    throw new Error("A valid GUTENEO_DRY_RUN_TOKEN is required.");
  if (
    !input.dispatchIds.length ||
    input.dispatchIds.length > 10 ||
    input.dispatchIds.some((id) => !/^dsp_[a-zA-Z0-9_-]{1,180}$/.test(id))
  )
    throw new Error("Supply 1–10 valid dispatch identifiers.");
  if (new Set(input.dispatchIds).size !== input.dispatchIds.length)
    throw new Error("Dispatch identifiers must be unique.");
  const now = input.now ?? Date.now;
  const fetcher = input.fetchImpl ?? fetch;
  const scenarios = [];
  for (const [index, dispatchId] of input.dispatchIds.entries()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetcher(
        `${origin}/api/dispatches/${encodeURIComponent(dispatchId)}/dry-run`,
        {
          method: "GET",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${input.token}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        scenarios.push({
          scenario: index + 1,
          status: "unavailable",
          code: `HTTP_${response.status}`,
        });
        await response.body?.cancel();
        continue;
      }
      if (
        response.status !== 200 ||
        response.redirected ||
        !/^application\/json(?:\s*;|$)/i.test(
          response.headers.get("content-type") ?? "",
        )
      )
        throw new Error("invalid");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("invalid");
      let bytes = 0,
        raw = "";
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 65536) {
            await reader.cancel();
            throw new Error("invalid");
          }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      const result = dispatchValidationResultSchema.parse(JSON.parse(raw));
      const age = now() - Date.parse(result.checkedAt);
      if (
        result.dispatchId !== dispatchId ||
        result.dispatchMode !== "production" ||
        age > 120000 ||
        age < -30000
      )
        throw new Error("invalid");
      if (
        result.checks.length !== checkIds.length ||
        new Set(result.checks.map((c) => c.id)).size !== checkIds.length ||
        result.checks.some((c) => !checkIds.includes(c.id))
      )
        throw new Error("invalid");
      for (const id of ["acceptance", "provider_delivery"]) {
        const check = result.checks.find((c) => c.id === id);
        if (check?.status !== "not_checked" || check.code !== "NOT_EXECUTED")
          throw new Error("invalid");
      }
      const blocked = result.checks.some((c) => c.status === "blocked");
      if ((result.status === "blocked") !== blocked) throw new Error("invalid");
      if (
        !blocked &&
        result.checks.some(
          (c) =>
            ["prepared_state", "submission_not_started", "quote"].includes(
              c.id,
            ) && c.status !== "passed",
        )
      )
        throw new Error("invalid");
      // No identifiers, fingerprints, content, recipient or credential in evidence.
      scenarios.push({
        scenario: index + 1,
        status: blocked ? "blocked" : "validation_passed",
        checkedAt: result.checkedAt,
        checks: result.checks,
      });
    } catch {
      scenarios.push({
        scenario: index + 1,
        status: "unavailable",
        code: "NO_VALID_EVIDENCE",
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    schema: 1,
    execution: "validation_only",
    qualification: "partial",
    checkedAt: new Date(now()).toISOString(),
    status: scenarios.every((s) => s.status === "validation_passed")
      ? "validation_passed"
      : "attention",
    scenarios,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2),
      dispatchIds: string[] = [];
    if (args.length === 1 && args[0] === "--help") {
      process.stdout.write(
        "Usage: npm run test:prod:dry-run -- --dispatch dsp_ID [--dispatch dsp_ID]\nCredential: GUTENEO_DRY_RUN_TOKEN (dispatches:read). Existing unexpired prepared quotes only.\nNo preparation, renewal, approval, reservation or provider request.\n",
      );
    } else {
      for (let i = 0; i < args.length; i += 2) {
        if (args[i] !== "--dispatch" || !args[i + 1])
          throw new Error("Use --dispatch dsp_ID (at most ten times).");
        dispatchIds.push(args[i + 1]);
      }
      const report = await inspectProductionDispatches({
        dispatchIds,
        token: process.env.GUTENEO_DRY_RUN_TOKEN ?? "",
      });
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      process.exitCode = report.status === "validation_passed" ? 0 : 1;
    }
  } catch {
    process.stderr.write(
      "Dry-run not started: supply a read token through GUTENEO_DRY_RUN_TOKEN and 1–10 unique --dispatch dsp_ID arguments. No credential or response body is logged.\n",
    );
    process.exitCode = 2;
  }
}
