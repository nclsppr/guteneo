import { z } from "zod";
import { exactMinor, type Fetcher } from "./types";
import {
  PINGEN_SYNTHETIC_SHA256,
  pingenSyntheticPdf,
} from "./pingen-synthetic-pdf";

// One source-reviewed run, not an operator API or a substitute for app consent.
export const PINGEN_QUALIFICATION = Object.freeze({
  runId: "20260917-synthetic-v1",
  filename: "guteneo-qualification-20260917-synthetic-v1.pdf",
  createBefore: "2026-09-18T12:00:00.000Z",
  journalKey: "qualification/pingen/20260917-synthetic-v1.json",
  uploadOrigin: "https://pingen2-production-transfer.objects.rma.cloudscale.ch",
});
const API = "https://api.pingen.com";
const IDENTITY = "https://identity.pingen.com/auth/access-tokens";
const OPTIONS = Object.freeze({
  country: "LU",
  paper_types: ["normal"],
  delivery_product: "cheap",
  print_mode: "simplex",
  print_spectrum: "grayscale",
});
const ADDRESS = "ATELIER EXEMPLE\nRue du Test 12\nL-1234 LUXEMBOURG";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const phaseSchema = z
  .object({ phase: z.enum(["calculator", "create", "inspect", "cleanup"]) })
  .strict();
type Phase = z.infer<typeof phaseSchema>["phase"];
const states = [
  "claimed",
  "created",
  "create_failed",
  "create_unknown",
  "delete_claimed",
  "delete_unknown",
  "deleted",
] as const;
const journalSchema = z
  .object({
    runId: z.literal(PINGEN_QUALIFICATION.runId),
    sourceSha256: z.literal(PINGEN_SYNTHETIC_SHA256),
    accountHash: z.string().regex(/^[a-f0-9]{64}$/),
    startedAt: z.number().int().nonnegative(),
    state: z.enum(states),
    revision: z.number().int().nonnegative(),
    providerId: id.optional(),
    deleteClaimedAt: z.number().int().nonnegative().optional(),
  })
  .strict();
type Journal = z.infer<typeof journalSchema>;
type Code =
  | "input_invalid"
  | "configuration_invalid"
  | "expired"
  | "journal_invalid"
  | "journal_conflict"
  | "journal_unavailable"
  | "already_claimed"
  | "no_created_draft"
  | "request_failed"
  | "request_timeout"
  | "response_invalid"
  | "http_error"
  | "scope_mismatch"
  | "profile_mismatch"
  | "upload_origin_mismatch"
  | "draft_mismatch"
  | "draft_submitted"
  | "delete_not_allowed"
  | "cleanup_pending"
  | "price_pending";
class Failure extends Error {
  constructor(
    readonly code: Code,
    readonly httpStatus?: number,
  ) {
    super(code);
  }
}
function fail(code: Code): never {
  throw new Failure(code);
}
export type PingenQualificationResult = {
  provider: "pingen";
  environment: "production";
  mode: "synthetic_draft_qualification";
  runId: string;
  sourceSha256: string;
  status: "ok" | "error";
  state: Journal["state"] | "not_started";
  liveSendingVerified: false;
  appJourneyVerified: false;
  canSend: false;
  price?: { currency: "EUR"; minor: number };
  draft?: {
    addressMatches: boolean;
    countryMatches: boolean;
    pages: number | null;
    normalPaper: boolean;
    fontsEmbedded: boolean;
    deleteAllowed: boolean;
    readyForSending: boolean;
    previewRedirectObserved: boolean;
  };
  error?: { code: Code; httpStatus?: number };
};
export type PingenQualificationConfig = {
  clientId: string;
  clientSecret: string;
  organisationId: string;
  environment: string;
  mode: string;
  sandbox: string;
  liveSendsEnabled: string;
  uploadOrigins: string;
};
const hash = async (value: string | Uint8Array<ArrayBuffer>) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof value === "string" ? new TextEncoder().encode(value) : value,
      ),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail("response_invalid");
const normalize = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();

/** No arbitrary URL, PDF, account or provider ID can enter through the RPC.
 * State is kept only under a separate private qualification key; no business writes.
 * Dependencies are server-owned and injection exists solely for intercepted tests.
 */
export async function qualifyPingenSynthetic(
  config: PingenQualificationConfig,
  bucket: Pick<R2Bucket, "get" | "put">,
  input: unknown,
  {
    fetcher = fetch,
    now = Date.now,
  }: { fetcher?: Fetcher; now?: () => number } = {},
): Promise<PingenQualificationResult> {
  const result: PingenQualificationResult = {
    provider: "pingen",
    environment: "production",
    mode: "synthetic_draft_qualification",
    runId: PINGEN_QUALIFICATION.runId,
    sourceSha256: PINGEN_SYNTHETIC_SHA256,
    status: "error",
    state: "not_started",
    liveSendingVerified: false,
    appJourneyVerified: false,
    canSend: false,
  };
  let phase: Phase;
  let journal: Journal | undefined;
  let etag: string | undefined;
  let postStarted = false;
  let deleteStarted = false;
  let ownedClaim = false;
  let observedProviderId: string | undefined;
  const deadline = () => {
    if (
      !Number.isFinite(now()) ||
      now() < Date.parse("2026-09-17T00:00:00.000Z")
    )
      fail("expired");
    if (
      (phase === "create" || phase === "calculator") &&
      now() >= Date.parse(PINGEN_QUALIFICATION.createBefore)
    )
      fail("expired");
    if (deleteStarted && now() >= (journal?.deleteClaimedAt ?? 0) + 30_000)
      fail("cleanup_pending");
  };
  const save = async (next: Journal) => {
    const saved = await bucket
      .put(PINGEN_QUALIFICATION.journalKey, JSON.stringify(next), {
        onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" },
        httpMetadata: {
          contentType: "application/json",
          cacheControl: "no-store",
        },
      })
      .catch(() => fail("journal_unavailable"));
    if (!saved) fail("journal_conflict");
    journal = next;
    etag = saved.etag;
    result.state = next.state;
  };
  // Deadline includes fetch and body consumption. Never return provider errors or links.
  const call = async (
    url: string,
    init: RequestInit,
    statuses: number[],
    json = true,
  ) => {
    deadline();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const operation = (async () => {
      const response = await fetcher(url, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      });
      if (!statuses.includes(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        throw new Failure("http_error", response.status);
      }
      if (!json || [202, 204, 302, 404, 410].includes(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        return { status: response.status, value: undefined as unknown };
      }
      if (Number(response.headers.get("content-length") ?? 0) > 65_536)
        fail("response_invalid");
      reader = response.body?.getReader();
      if (!reader) fail("response_invalid");
      const decoder = new TextDecoder();
      let size = 0;
      let text = "";
      for (;;) {
        const chunk = await reader.read();
        if (controller.signal.aborted) fail("request_timeout");
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 65_536) fail("response_invalid");
        text += decoder.decode(chunk.value, { stream: true });
      }
      try {
        return {
          status: response.status,
          value: JSON.parse(text + decoder.decode()) as unknown,
        };
      } catch {
        return fail("response_invalid");
      }
    })();
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Failure("request_timeout"));
          }, 8_000);
        }),
      ]);
    } catch (error) {
      throw error instanceof Failure ? error : new Failure("request_failed");
    } finally {
      clearTimeout(timer);
      controller.abort();
      void reader?.cancel().catch(() => undefined);
    }
  };
  try {
    const parsed = phaseSchema.safeParse(input);
    if (!parsed.success) fail("input_invalid");
    phase = parsed.data.phase;
    if (
      config.environment !== "production" ||
      config.mode !== "production" ||
      config.sandbox !== "false" ||
      config.liveSendsEnabled !== "false" ||
      !id.safeParse(config.organisationId).success ||
      !/^[\x21-\x7e]{1,4096}$/.test(config.clientId) ||
      !/^[\x21-\x7e]{1,4096}$/.test(config.clientSecret) ||
      config.uploadOrigins.trim() !== PINGEN_QUALIFICATION.uploadOrigin
    )
      fail("configuration_invalid");
    deadline();
    const accountHash = await hash(
      JSON.stringify([config.organisationId, config.clientId, config.sandbox]),
    );
    const stored = await bucket
      .get(PINGEN_QUALIFICATION.journalKey)
      .catch(() => fail("journal_unavailable"));
    if (stored) {
      if (stored.size > 2048) fail("journal_invalid");
      let value: unknown;
      try {
        value = await stored.json();
      } catch {
        fail("journal_invalid");
      }
      const parsedJournal = journalSchema.safeParse(value);
      if (
        !parsedJournal.success ||
        parsedJournal.data.accountHash !== accountHash
      )
        fail("journal_invalid");
      journal = parsedJournal.data;
      etag = stored.etag;
      result.state = journal.state;
    }
    if (phase === "create") {
      if (journal) fail("already_claimed");
      deadline();
      await save({
        runId: PINGEN_QUALIFICATION.runId,
        sourceSha256: PINGEN_SYNTHETIC_SHA256,
        accountHash,
        startedAt: now(),
        revision: 0,
        state: "claimed",
      });
      ownedClaim = true;
    } else if (phase !== "calculator") {
      if (!journal?.providerId) fail("no_created_draft");
      if (journal.state === "deleted") {
        result.status = "ok";
        return result;
      }
      if (
        ![
          "created",
          "create_unknown",
          "delete_claimed",
          "delete_unknown",
        ].includes(journal.state)
      )
        fail("no_created_draft");
    }
    const tokenResponse = await call(
      IDENTITY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: "letter organisation_read",
        }),
      },
      [200],
    );
    const token = z
      .object({
        access_token: z.string().regex(/^[\x21-\x7e]{1,16384}$/),
        token_type: z.string().regex(/^Bearer$/i),
        expires_in: z.number().int().positive().max(86400),
        scope: z.string().optional(),
      })
      .safeParse(tokenResponse.value);
    if (!token.success) fail("response_invalid");
    if (
      token.data.scope !== undefined &&
      token.data.scope.trim().split(/\s+/).sort().join(" ") !==
        "letter organisation_read"
    )
      fail("scope_mismatch");
    const headers = {
      Authorization: `Bearer ${token.data.access_token}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    };
    const base = `${API}/organisations/${config.organisationId}/deliveries/letters`;
    if (phase === "calculator" || phase === "create") {
      const profile = object(
        object(
          (
            await call(
              `${API}/organisations/${config.organisationId}`,
              { headers },
              [200],
            )
          ).value,
        ).data,
      );
      const attributes = object(profile.attributes);
      if (
        profile.id !== config.organisationId ||
        profile.type !== "organisations" ||
        attributes.billing_currency !== "EUR" ||
        attributes.default_country !== "LU" ||
        attributes.default_address_position !== "left"
      )
        fail("profile_mismatch");
    }
    if (phase === "calculator") {
      // No letter is created by this operation. 202 contains no usable quote yet.
      const response = await call(
        `${base}/price-calculator`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            data: { type: "letter_price_calculator", attributes: OPTIONS },
          }),
        },
        [200, 202],
      );
      if (response.status === 202) fail("price_pending");
      const data = object(object(response.value).data);
      const attributes = object(data.attributes);
      if (
        data.type !== "letter_price_calculator" ||
        attributes.currency !== "EUR"
      )
        fail("response_invalid");
      if (
        typeof attributes.price !== "number" &&
        typeof attributes.price !== "string"
      )
        fail("response_invalid");
      let minor: number;
      try {
        minor = exactMinor(attributes.price, "EUR").minor;
      } catch {
        return fail("response_invalid");
      }
      if (minor < 0 || minor > 100_000) fail("response_invalid");
      result.price = { currency: "EUR", minor };
      result.status = "ok";
      return result;
    }
    if (phase === "create") {
      const pdf = pingenSyntheticPdf();
      if ((await hash(pdf)) !== PINGEN_SYNTHETIC_SHA256)
        fail("configuration_invalid");
      const upload = object(
        object((await call(`${API}/file-upload`, { headers }, [200])).value)
          .data,
      );
      const attributes = object(upload.attributes);
      if (
        upload.type !== "file_uploads" ||
        typeof attributes.url !== "string" ||
        typeof attributes.url_signature !== "string" ||
        attributes.url.length > 32768 ||
        attributes.url_signature.length > 4096 ||
        !attributes.url_signature
      )
        fail("response_invalid");
      const raw = attributes.url;
      if (!/^https:\/\/[\x21-\x7e]+$/.test(raw) || raw.includes("\\"))
        fail("upload_origin_mismatch");
      let target: URL;
      try {
        target = new URL(raw);
      } catch {
        return fail("upload_origin_mismatch");
      }
      if (
        target.origin !== PINGEN_QUALIFICATION.uploadOrigin ||
        target.username ||
        target.password ||
        target.port ||
        target.hash
      )
        fail("upload_origin_mismatch");
      await call(
        raw,
        {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: pdf,
        },
        [200, 201, 204],
        false,
      );
      deadline();
      postStarted = true;
      const created = object(
        object(
          (
            await call(
              base,
              {
                method: "POST",
                headers: {
                  ...headers,
                  "Idempotency-Key": PINGEN_QUALIFICATION.runId,
                },
                body: JSON.stringify({
                  data: {
                    type: "letters",
                    attributes: {
                      file_original_name: PINGEN_QUALIFICATION.filename,
                      file_url: raw,
                      file_url_signature: attributes.url_signature,
                      address_position: "left",
                      auto_send: false,
                    },
                  },
                }),
              },
              [201],
            )
          ).value,
        ).data,
      );
      const providerId = id.safeParse(created.id);
      if (created.type !== "letters" || !providerId.success)
        fail("response_invalid");
      observedProviderId = providerId.data;
      await save({
        ...journal!,
        providerId: providerId.data,
        state: "created",
        revision: journal!.revision + 1,
      });
      result.status = "ok";
      return result;
    }
    const letterUrl = `${base}/${journal!.providerId!}`;
    // A failed DELETE acknowledgement can be reconciled by a later explicit cleanup.
    const mayReconcile =
      phase === "cleanup" &&
      ["delete_claimed", "delete_unknown"].includes(journal!.state);
    const response = await call(
      letterUrl,
      { headers },
      mayReconcile ? [200, 404, 410] : [200],
    );
    if (response.status !== 200) {
      await save({
        ...journal!,
        state: "deleted",
        revision: journal!.revision + 1,
      });
      result.status = "ok";
      return result;
    }
    const data = object(object(response.value).data);
    const attributes = object(data.attributes);
    const organization = object(
      object(object(data.relationships).organisation).data,
    );
    const createdAt =
      typeof attributes.created_at === "string"
        ? Date.parse(attributes.created_at)
        : NaN;
    if (
      data.id !== journal!.providerId ||
      data.type !== "letters" ||
      organization.type !== "organisations" ||
      organization.id !== config.organisationId ||
      attributes.file_original_name !== PINGEN_QUALIFICATION.filename ||
      !Number.isFinite(createdAt) ||
      createdAt < journal!.startedAt - 60_000 ||
      createdAt > journal!.startedAt + 600_000 ||
      createdAt > now() + 60_000
    )
      fail("draft_mismatch");
    if (attributes.submitted_at !== null) fail("draft_submitted");
    const abilities = object(object(object(data.meta).abilities).self);
    for (const key of ["delete", "submit", "get-pdf-raw"])
      if (!["ok", "state", "permission"].includes(String(abilities[key])))
        fail("response_invalid");
    const summary = {
      addressMatches:
        typeof attributes.address === "string" &&
        normalize(attributes.address) === normalize(ADDRESS),
      countryMatches: attributes.country === "LU",
      pages:
        typeof attributes.file_pages === "number" &&
        Number.isInteger(attributes.file_pages) &&
        attributes.file_pages > 0 &&
        attributes.file_pages <= 320
          ? attributes.file_pages
          : null,
      normalPaper:
        Array.isArray(attributes.paper_types) &&
        attributes.paper_types.length === 1 &&
        attributes.paper_types[0] === "normal",
      fontsEmbedded:
        Array.isArray(attributes.fonts) &&
        attributes.fonts.length > 0 &&
        attributes.fonts.length <= 64 &&
        attributes.fonts.every(
          (font: unknown) => object(font).is_embedded === true,
        ),
      deleteAllowed: abilities.delete === "ok",
      readyForSending: abilities.submit === "ok",
      previewRedirectObserved: false,
    };
    if (phase === "inspect" && abilities["get-pdf-raw"] === "ok") {
      // Observe the documented 302 only. Never inspect, return or follow Location.
      await call(`${letterUrl}/file`, { headers }, [302], false);
      summary.previewRedirectObserved = true;
    }
    result.draft = summary;
    if (phase === "cleanup") {
      if (
        journal!.state === "delete_claimed" &&
        now() < (journal!.deleteClaimedAt ?? Infinity) + 120_000
      )
        fail("cleanup_pending");
      if (!summary.deleteAllowed) fail("delete_not_allowed");
      deadline();
      await save({
        ...journal!,
        state: "delete_claimed",
        deleteClaimedAt: now(),
        revision: journal!.revision + 1,
      });
      deleteStarted = true;
      // Fence a delayed invocation before the external idempotent deletion.
      const current = await bucket
        .get(PINGEN_QUALIFICATION.journalKey)
        .catch(() => fail("journal_unavailable"));
      if (current?.etag !== etag) fail("journal_conflict");
      await call(letterUrl, { method: "DELETE", headers }, [204], false);
      await save({
        ...journal!,
        state: "deleted",
        revision: journal!.revision + 1,
      });
    }
    result.status = "ok";
    return result;
  } catch (error) {
    if (ownedClaim && journal?.state === "claimed") {
      try {
        await save({
          ...journal,
          state: postStarted ? "create_unknown" : "create_failed",
          ...(observedProviderId ? { providerId: observedProviderId } : {}),
          revision: journal.revision + 1,
        });
      } catch {
        result.state = "create_unknown";
      }
    }
    if (deleteStarted && journal?.state === "delete_claimed") {
      try {
        await save({
          ...journal,
          state: "delete_unknown",
          revision: journal.revision + 1,
        });
      } catch {
        result.state = "delete_unknown";
      }
    }
    const safe =
      error instanceof Failure ? error : new Failure("request_failed");
    result.error = {
      code: safe.code,
      ...(safe.httpStatus === undefined ? {} : { httpStatus: safe.httpStatus }),
    };
    return result;
  }
}
