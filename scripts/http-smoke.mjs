/**
 * Actual local Worker HTTP smoke and small sequential acceptance measurement.
 * Requires `npm run demo` (and local document renderer for render journeys).
 * Does not start/reset services, change quotas, contact providers or print tokens.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { PDFDocument, StandardFonts } from "pdf-lib";

const origin = process.env.GUTENEO_TEST_ORIGIN ?? "http://localhost:8787";
const parsedOrigin = new URL(origin);
if (
  parsedOrigin.origin !== origin ||
  !["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname) ||
  parsedOrigin.protocol !== "http:"
) {
  throw new Error(
    "This test is restricted to an explicit HTTP loopback origin.",
  );
}
const runId = randomUUID();
const sampleCount = 15;
const startServer = process.argv.includes("--with-server");
let server;
const report = {
  runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  outcome: "running",
  conditions: {
    origin,
    environment: "local",
    mode: "simulation",
    organization: "org_studio",
    transport: "Actual HTTP to Wrangler/workerd with local D1/R2/Queues",
    sampleCount,
    concurrency: 1,
    firstMeasuredRequestRetained: true,
    serverStartedByScript: startServer,
    acceptanceMeasurement:
      "POST confirmation round trip, including durable D1 acceptance and attempted queue publication; excludes upload, PDF render, preparation and human review time.",
    projectionMeasurement:
      "First observed simulated terminal result from confirmation request start. Initial read is immediate; remaining results are polled after the acceptance batch. Includes queue wait, batch duration and polling; NOT provider callback-ingestion latency.",
    limitations: [
      "Small single-process local sample, not staging or load qualification.",
      "No real provider transmission, real OAuth login, real assistant client or monthly availability measurement.",
      "Browser authentication and MCP tokens use explicitly labelled local simulation.",
      "Existing local data and quotas are retained; this run adds up to 15 simulated email sends.",
    ],
  },
  checks: [],
  samples: [],
  metrics: null,
  failure: null,
};

async function http(
  path,
  {
    session,
    bearer,
    method = "GET",
    body,
    headers = {},
    csrf = true,
    originHeader = origin,
  } = {},
) {
  const requestHeaders = new Headers(headers);
  if (originHeader) requestHeaders.set("Origin", originHeader);
  if (session) {
    requestHeaders.set("Cookie", session.cookie);
    if (csrf) requestHeaders.set("X-CSRF-Token", session.csrfToken);
  }
  if (bearer) requestHeaders.set("Authorization", `Bearer ${bearer}`);
  const payload =
    body instanceof FormData
      ? body
      : body === undefined
        ? undefined
        : JSON.stringify(body);
  if (body !== undefined && !(body instanceof FormData))
    requestHeaders.set("Content-Type", "application/json");
  const started = performance.now();
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: requestHeaders,
    body: payload,
    signal: AbortSignal.timeout(15_000),
    redirect: "manual",
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const durationMs = performance.now() - started;
  const raw = new TextDecoder().decode(bytes);
  let data;
  if (response.headers.get("Content-Type")?.includes("application/json"))
    data = JSON.parse(raw);
  else if (
    response.headers.get("Content-Type")?.includes("text/event-stream")
  ) {
    const lines = raw.split("\n").filter((line) => line.startsWith("data:"));
    if (lines.length) data = JSON.parse(lines.at(-1).slice(5));
  }
  return {
    status: response.status,
    headers: response.headers,
    bytes,
    data,
    durationMs,
  };
}
function check(name, condition, details = {}) {
  report.checks.push({ name, passed: Boolean(condition), ...details });
  assert.ok(condition, name);
}
async function login(organization) {
  const response = await http("/api/dev/login", {
    method: "POST",
    body: { organization },
  });
  check(
    `login_${organization}_simulation`,
    response.status === 200 && response.data?.simulation === true,
  );
  const cookie = response.headers.get("Set-Cookie");
  check(
    `login_${organization}_cookie_httpOnly`,
    cookie?.includes("HttpOnly") && cookie?.includes("SameSite=Lax"),
  );
  return {
    cookie: cookie.split(";")[0],
    csrfToken: response.data.csrfToken,
    organizationId: response.data.organization.id,
  };
}
async function mcp(token, method, params = {}) {
  return http("/mcp", {
    method: "POST",
    bearer: token,
    headers: {
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: { jsonrpc: "2.0", id: randomUUID(), method, params },
  });
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rounded = (n) => Math.round(n * 100) / 100;
function distribution(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = (p) =>
    ordered[Math.max(0, Math.ceil(ordered.length * p) - 1)];
  return {
    count: ordered.length,
    minMs: rounded(ordered[0]),
    medianMs: rounded(percentile(0.5)),
    p95Ms: rounded(percentile(0.95)),
    maxMs: rounded(ordered.at(-1)),
  };
}

try {
  if (startServer) {
    server = spawn(process.execPath, ["scripts/dev.mjs"], {
      cwd: new URL("../", import.meta.url),
      stdio: "ignore",
      detached: true,
    });
    const deadline = performance.now() + 45_000;
    let ready = false;
    while (performance.now() < deadline) {
      if (server.exitCode !== null)
        throw new Error(
          `Local dev process exited with code ${server.exitCode}`,
        );
      try {
        const response = await fetch(`${origin}/api/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        /* bounded local startup */
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!ready)
      throw new Error(
        "Local dev server did not become ready within 45 seconds.",
      );
  }
  const health = await http("/api/health");
  check(
    "server_explicitly_simulation",
    health.status === 200 && health.data?.mode === "simulation",
  );
  const caps = await http("/api/capabilities");
  check(
    "real_transmissions_disabled",
    caps.data?.simulation === true && caps.data?.liveSending === false,
  );
  const unauthenticated = await http("/api/documents");
  check("unauthenticated_documents_rejected", unauthenticated.status === 401);
  const studio = await login("studio");
  const atelier = await login("atelier");
  const session = await http("/api/session", { session: studio });
  check(
    "session_organization_from_membership",
    session.data?.organization?.id === "org_studio",
  );
  const spoofed = await http("/api/session", {
    session: studio,
    headers: { "X-Organization-Id": "org_atelier" },
  });
  check(
    "client_organization_header_ignored",
    spoofed.data?.organization?.id === "org_studio",
  );
  const noCsrf = await http("/api/documents/render", {
    session: studio,
    method: "POST",
    csrf: false,
    body: { name: "must-not-render.pdf", html: "<p>Rejected request.</p>" },
  });
  check(
    "mutation_missing_csrf_rejected",
    noCsrf.status === 403 && noCsrf.data?.error?.code === "CSRF_REJECTED",
  );
  const foreignOrigin = await http("/api/documents/render", {
    session: studio,
    method: "POST",
    originHeader: "https://attacker.invalid",
    body: { name: "must-not-render.pdf", html: "<p>Rejected request.</p>" },
  });
  check(
    "mutation_foreign_origin_rejected",
    foreignOrigin.status === 403 &&
      foreignOrigin.data?.error?.code === "ORIGIN_REJECTED",
  );

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .addPage([595, 842])
    .drawText("Guteneo - local HTTP smoke - SIMULATION", {
      x: 40,
      y: 780,
      size: 14,
      font,
    });
  const bytes = await pdf.save();
  const form = new FormData();
  form.set(
    "file",
    new Blob([bytes], { type: "application/pdf" }),
    "http-smoke-simulation.pdf",
  );
  const imported = await http("/api/documents", {
    session: studio,
    method: "POST",
    body: form,
  });
  check(
    "exact_pdf_import_ready_in_simulation",
    imported.status === 201 && imported.data?.status === "ready",
    { documentId: imported.data?.id },
  );
  check("import_hash_matches_original", imported.data.sha256 === hash(bytes));
  const content = await http(`/api/documents/${imported.data.id}/content`, {
    session: studio,
  });
  check(
    "authenticated_preview_preserves_exact_bytes",
    content.status === 200 && hash(content.bytes) === hash(bytes),
  );
  const otherContent = await http(
    `/api/documents/${imported.data.id}/content`,
    { session: atelier },
  );
  check(
    "other_organization_cannot_read_pdf",
    [403, 404].includes(otherContent.status),
  );
  const publicContent = await http(
    `/api/documents/${imported.data.id}/content`,
  );
  check("public_pdf_access_denied", publicContent.status === 401);
  const otherList = await http("/api/documents", { session: atelier });
  check(
    "other_organization_document_list_isolated",
    !otherList.data.items.some((item) => item.id === imported.data.id),
  );

  const tokenResponse = await http("/api/dev/mcp-token", {
    session: studio,
    method: "POST",
    body: {},
  });
  check(
    "local_mcp_credential_explicit_simulation",
    tokenResponse.status === 200 && tokenResponse.data?.simulation === true,
  );
  const token = tokenResponse.data.token;
  const listed = await mcp(token, "tools/list");
  check(
    "actual_stateless_http_mcp_tools_list",
    listed.status === 200 && Array.isArray(listed.data?.result?.tools),
  );
  const tools = listed.data.result.tools;
  check(
    "mcp_has_no_human_approval_tool",
    !tools.some((tool) => /approve/.test(tool.name)),
    { toolNames: tools.map((tool) => tool.name) },
  );
  const fileSchema = tools.find((tool) => tool.name === "import_document")
    ?.inputSchema.properties.file;
  check(
    "mcp_file_params_contract_exact",
    fileSchema &&
      JSON.stringify(fileSchema.required) ===
        JSON.stringify(["download_url", "file_id"]) &&
      ["mime_type", "file_name"].every((name) => name in fileSchema.properties),
  );
  const mcpNoAuth = await http("/mcp", {
    method: "POST",
    headers: { Accept: "application/json, text/event-stream" },
    body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  check(
    "mcp_oauth_discovery_challenge",
    mcpNoAuth.status === 401 &&
      mcpNoAuth.headers
        .get("WWW-Authenticate")
        ?.includes("/.well-known/oauth-protected-resource/mcp"),
  );

  const usage = await http("/api/usage", { session: studio });
  const emailBudget = usage.data.items.find((item) => item.channel === "email");
  check(
    "enough_existing_test_credit_without_topup",
    emailBudget &&
      emailBudget.limit_count -
        emailBudget.confirmed_count -
        emailBudget.reserved_count >=
        sampleCount,
  );
  const terminalSamples = [];
  for (let index = 0; index < sampleCount; index++) {
    const key = `http-smoke-${runId}-${index}`;
    const prepared = await http("/api/dispatches", {
      session: studio,
      method: "POST",
      headers: { "Idempotency-Key": `${key}-prepare` },
      body: {
        channel: "email",
        recipient: { email: `simulation-${index}@example.invalid` },
        subject: `Simulation HTTP ${index + 1}`,
        html: "<p>Mesure locale, aucune communication réelle.</p>",
        text: "Mesure locale, aucune communication reelle.",
      },
    });
    assert.equal(
      prepared.status,
      201,
      `prepare sample ${index}: ${prepared.data?.error?.code ?? prepared.status}`,
    );
    assert.equal(prepared.data.mode, "simulation");
    const dispatch = prepared.data;
    if (index === 0) {
      const premature = await mcp(token, "tools/call", {
        name: "confirm_dispatch",
        arguments: {
          dispatchId: dispatch.id,
          idempotencyKey: `${key}-confirm`,
        },
      });
      check(
        "llm_cannot_confirm_without_human_approval",
        premature.data?.result?.structuredContent?.error?.code ===
          "APPROVAL_REQUIRED",
      );
      const modelApproval = await http(
        `/api/dispatches/${dispatch.id}/approve`,
        {
          bearer: token,
          method: "POST",
          body: { fingerprint: dispatch.fingerprint },
        },
      );
      check(
        "bearer_cannot_impersonate_browser_approval",
        modelApproval.status === 401,
      );
      const forgedApproval = await mcp(token, "tools/call", {
        name: "confirm_dispatch",
        arguments: {
          dispatchId: dispatch.id,
          idempotencyKey: `${key}-confirm`,
          user_confirmed: true,
        },
      });
      check(
        "model_confirmed_boolean_rejected",
        Boolean(
          forgedApproval.data?.error || forgedApproval.data?.result?.isError,
        ),
      );
    }
    const approval = await http(`/api/dispatches/${dispatch.id}/approve`, {
      session: studio,
      method: "POST",
      body: { fingerprint: dispatch.fingerprint },
    });
    assert.equal(approval.status, 200, `approve sample ${index}`);
    const acceptedAt = performance.now();
    const accepted = await http(`/api/dispatches/${dispatch.id}/confirm`, {
      session: studio,
      method: "POST",
      headers: { "Idempotency-Key": `${key}-confirm` },
      body: {},
    });
    assert.equal(
      accepted.status,
      200,
      `confirm sample ${index}: ${accepted.data?.error?.code ?? accepted.status}`,
    );
    assert.equal(accepted.data.id, dispatch.id);
    assert.ok(
      ["queued", "accepted", "delivered"].includes(accepted.data.status),
    );
    const persisted = await http(`/api/dispatches/${dispatch.id}`, {
      session: studio,
    });
    assert.equal(persisted.data.dispatch.id, dispatch.id);
    assert.notEqual(persisted.data.dispatch.status, "prepared");
    const sample = {
      index: index + 1,
      dispatchId: dispatch.id,
      acceptanceRoundTripMs: rounded(accepted.durationMs),
      statusOnRead: persisted.data.dispatch.status,
      correlationId: accepted.headers.get("X-Correlation-ID"),
      resultFirstObservedMs:
        persisted.data.dispatch.status === "delivered"
          ? rounded(performance.now() - acceptedAt)
          : null,
    };
    report.samples.push(sample);
    terminalSamples.push({ sample, acceptedAt });
  }
  check(
    "all_acceptance_responses_persisted",
    report.samples.length === sampleCount,
  );

  // One paginated read per poll keeps this small run safely below the org HTTP ceiling.
  const deadline = performance.now() + 15_000;
  do {
    const listedDispatches = await http("/api/dispatches?limit=100", {
      session: studio,
    });
    assert.equal(listedDispatches.status, 200);
    const observedAt = performance.now();
    for (const { sample, acceptedAt } of terminalSamples) {
      const value = listedDispatches.data.items.find(
        (item) => item.id === sample.dispatchId,
      );
      if (
        sample.resultFirstObservedMs === null &&
        value?.status === "delivered"
      )
        sample.resultFirstObservedMs = rounded(observedAt - acceptedAt);
    }
    if (report.samples.every((sample) => sample.resultFirstObservedMs !== null))
      break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  } while (performance.now() < deadline);
  check(
    "all_results_are_simulated_terminal_facts",
    report.samples.every((sample) => sample.resultFirstObservedMs !== null),
  );
  report.metrics = {
    acceptance: distribution(
      report.samples.map((sample) => sample.acceptanceRoundTripMs),
    ),
    simulatedResultFirstObserved: distribution(
      report.samples.map((sample) => sample.resultFirstObservedMs),
    ),
    initialAcceptanceP95GoalMs: 2000,
    goalMetOnlyInTheseLocalConditions:
      distribution(report.samples.map((sample) => sample.acceptanceRoundTripMs))
        .p95Ms < 2000,
    providerCallbackLatencyMeasured: false,
  };
  report.outcome = "passed";
} catch (error) {
  report.outcome = "failed";
  report.failure = {
    name: error?.name ?? "Error",
    message: error?.message ?? "HTTP smoke failed",
  };
  process.exitCode = 1;
} finally {
  if (server?.pid) {
    // Only terminate the process group created by this invocation, never a shared user server.
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (server.exitCode === null) {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {
        /* already stopped */
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../reports/http-smoke.json", import.meta.url),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      outcome: report.outcome,
      checks: report.checks.length,
      samples: report.samples.length,
      acceptanceP95Ms: report.metrics?.acceptance.p95Ms ?? null,
      report: "reports/http-smoke.json",
      ...(report.failure ? { failure: report.failure } : {}),
    }),
  );
}
