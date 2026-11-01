import { createHash } from "node:crypto";
import {
  inspectTelnyxReadiness,
  telnyxAccountReference,
  type TelnyxReadiness,
} from "../../../packages/providers/telnyx-readiness";
import {
  FaxReferenceSourceError,
  parseEeaFaxRateDeck,
  parseReferenceFx,
  parseReferencePagePrice,
  validateEeaFaxReferenceScope,
} from "../../../packages/providers/fax-eea-reference.mjs";
import {
  readCurrentFaxTariffCatalog,
  type FaxTariffRefreshCounts,
} from "./fax-tariff-refresh";
import type { Env } from "./env";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PAGE = "https://telnyx.com/pricing/fax";
const FX = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
type Row = Record<string, string | number | null>;
type Source = Row & {
  organization_id: string;
  id: string;
  sender_id: string;
  sender_address_sha256: string;
  account_id: string;
  connection_id: string;
  outbound_profile_id: string;
  bindings_json: string;
  exclusions_json: string;
};
type Candidate = Source & {
  sender_address: string | null;
  valid_source: number;
  failure_count: number;
  applying_revision_sha256: string | null;
  applying_plan_json: string | null;
};
type Code =
  | "SOURCE_HTTP"
  | "SOURCE_TOO_LARGE"
  | "SOURCE_INVALID"
  | "SOURCE_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "BINDING_CHANGED"
  | "EXCLUSION_CHANGED"
  | "QUOTE_ACTIVE"
  | "COMMIT_CHANGED"
  | "DATABASE_UNAVAILABLE"
  | "COMMIT_UNCONFIRMED";
class RefreshError extends Error {
  constructor(readonly code: Code) {
    super(code);
  }
}
function fail(code: Code): never {
  throw new RefreshError(code);
}
const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
const bindingHash = (organizationId: string, id: string) =>
  digest(
    canonical({
      organizationId,
      family: "fax_tariff",
      mechanism: "manual_fax:" + id,
    }),
  );
const variableColumns = new Set([
  "id",
  "page_nano_usd",
  "minute_nano_usd",
  "call_nano_usd",
  "fx_numerator",
  "fx_denominator",
  "fx_date",
  "fx_source",
  "source_reference",
  "source_sha256",
  "valid_from",
  "expires_at",
  "created_at",
  "status",
]);
function columns(row: Row) {
  const keys = Object.keys(row).sort();
  if (
    keys.length !== 43 ||
    keys.some((key) => !/^[a-z_][a-z0-9_]*$/.test(key)) ||
    Object.values(row).some(
      (value) =>
        value !== null &&
        typeof value !== "string" &&
        !(typeof value === "number" && Number.isSafeInteger(value)),
    )
  )
    fail("BINDING_CHANGED");
  return keys;
}
function sourceOnly(value: Candidate): Source {
  const {
    sender_address: _address,
    valid_source: _valid,
    failure_count: _failures,
    applying_revision_sha256: _revision,
    applying_plan_json: _plan,
    ...source
  } = value;
  return source as Source;
}
function conjunction(terms: string[]): string {
  if (terms.length === 1) return terms[0];
  const middle = Math.floor(terms.length / 2);
  return `(${conjunction(terms.slice(0, middle))} AND ${conjunction(terms.slice(middle))})`;
}
function scope(source: Source, alias: string, input = "input.source") {
  return conjunction(
    [
      "organization_id",
      "sender_id",
      "account_id",
      "connection_id",
      "outbound_profile_id",
      "options_json",
    ].map((key) => `${alias}.${key} IS json_extract(${input},'$.${key}')`),
  );
}
function inventoryPredicate(source: Source, alias: string) {
  void source;
  return `${scope(source, alias)} AND ${alias}.status='qualified' AND EXISTS(SELECT 1 FROM json_each(json_extract(input.source,'$.bindings_json')) anchor WHERE substr(${alias}.destination_prefix,1,length(json_extract(anchor.value,'$.destination_prefix')))=json_extract(anchor.value,'$.destination_prefix'))`;
}
function quotePredicate(source: Source) {
  return `EXISTS(SELECT 1 FROM live_fax_quotes_v3 q JOIN trusted_fax_usage_tariffs t ON t.organization_id=q.organization_id AND t.id=q.tariff_id JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id WHERE ${scope(source, "t")} AND EXISTS(SELECT 1 FROM json_each(json_extract(input.source,'$.bindings_json')) anchor WHERE t.destination_prefix=json_extract(anchor.value,'$.destination_prefix')) AND (d.status IN ('queued','submitting','submission_unknown') OR (d.status='prepared' AND q.expires_at>input.at)))`;
}
async function hasQuotes(db: D1Database, source: Source, at: string) {
  return Boolean(
    await db
      .prepare(
        `WITH input AS (SELECT ? source,? at) SELECT 1 FROM input WHERE ${quotePredicate(source)}`,
      )
      .bind(JSON.stringify(source), at)
      .first(),
  );
}
async function* chunks(
  response: Response,
  maximum: number,
  signal: AbortSignal,
): AsyncGenerator<Uint8Array> {
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    await response.body?.cancel();
    fail("SOURCE_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) fail("SOURCE_HTTP");
  let total = 0;
  const cancel = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const part = await reader.read();
      if (signal.aborted) fail("SOURCE_TIMEOUT");
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maximum) fail("SOURCE_TOO_LARGE");
      yield part.value;
    }
    if (!total) fail("SOURCE_INVALID");
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
  }
}
async function bytes(response: Response, maximum: number, signal: AbortSignal) {
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const part of chunks(response, maximum, signal)) {
    parts.push(part);
    size += part.byteLength;
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}
function owns(result: TelnyxReadiness, source: Source, address: string) {
  const partial =
    result.status === "partial" &&
    canonical(result.errors) ===
      canonical([
        {
          stage: "outbound_profile",
          code: "invalid_response",
          invalidFields: ["daily_spend_limit"],
        },
      ]) &&
    result.outboundProfile?.dailySpendLimitEnabled === false;
  return (
    result.provider === "telnyx" &&
    result.mode === "read_only" &&
    ((result.status === "ok" && result.errors.length === 0) || partial) &&
    result.application?.id === source.connection_id &&
    result.application.active === true &&
    result.application.outboundVoiceProfileId === source.outbound_profile_id &&
    result.outboundProfile?.id === source.outbound_profile_id &&
    result.outboundProfile.enabled === true &&
    ["FR", "DE"].every((country) =>
      result.outboundProfile?.whitelistedDestinations?.includes(country),
    ) &&
    result.numberPagination.complete === true &&
    result.numbers.some(
      (number) =>
        number.phoneNumber === address &&
        number.country === "LU" &&
        number.status === "active" &&
        number.features.t38FaxGatewayEnabled === true,
    )
  );
}
type Plan = {
  source: Source;
  address: string;
  current: Row[];
  exclusions: Row[];
  next: Row[];
  revision: string;
  observedAt: string;
  expiresAt: string;
  evidence: Record<string, unknown>;
};
async function committed(db: D1Database, plan: Plan) {
  const evidence = await db
    .prepare(
      "SELECT * FROM verified_fax_reference_evidence WHERE organization_id=? AND set_id=? AND revision_sha256=?",
    )
    .bind(plan.source.organization_id, plan.source.id, plan.revision)
    .first<Row>();
  if (
    !evidence ||
    evidence.observed_at !== plan.observedAt ||
    evidence.expires_at !== plan.expiresAt ||
    evidence.evidence_json !== canonical(plan.evidence) ||
    evidence.tariff_ids_json !== canonical(plan.next.map((row) => row.id))
  )
    return false;
  const rows = await db
    .prepare(
      "SELECT t.*,m.binding_sha256 FROM trusted_fax_usage_tariffs t JOIN verified_fax_reference_tariffs m ON m.organization_id=t.organization_id AND m.tariff_id=t.id WHERE m.organization_id=? AND m.set_id=? AND t.id IN (SELECT value FROM json_each(?)) ORDER BY t.destination_prefix",
    )
    .bind(
      plan.source.organization_id,
      plan.source.id,
      JSON.stringify(plan.next.map((row) => row.id)),
    )
    .all<Row>();
  return (
    rows.results.length === 14 &&
    rows.results.every(({ binding_sha256, ...row }, index) => {
      const expected = plan.next[index];
      return (
        binding_sha256 ===
          bindingHash(plan.source.organization_id, String(row.id)) &&
        canonical({ ...row, status: "qualified" }) === canonical(expected)
      );
    })
  );
}

/** Refreshes one immutable fourteen-route group, never a dispatch or authority. */
export async function refreshVerifiedFaxReferences(
  env: Env,
  dependencies: {
    now?: () => number;
    fetcher?: typeof fetch;
    inspect?: typeof inspectTelnyxReadiness;
  } = {},
): Promise<FaxTariffRefreshCounts & { networkAttempted: boolean }> {
  const counts = {
    tariffsRefreshed: 0,
    tariffRefreshFailed: 0,
    tariffRefreshDeferred: 0,
    networkAttempted: false,
  };
  if (env.MODE !== "production" || env.ENVIRONMENT !== "production")
    return counts;
  const now = dependencies.now ?? Date.now;
  const at = () => new Date(now()).toISOString();
  let candidate: Candidate | null = null;
  let source: Source | null = null;
  let lease: string | null = null;
  let plan: Plan | null = null;
  let batchAttempted = false;
  const finish = async (code: Code, deferred = false, preservePlan = false) => {
    if (!source || !candidate || !lease) return;
    const failures = Math.min(16, candidate.failure_count + (deferred ? 0 : 1));
    const statements = [
      env.DB.prepare(
        `UPDATE verified_fax_reference_state SET lease_token=NULL,lease_until=NULL,last_error_code=?,failure_count=?,next_due_at=?${preservePlan ? "" : ",applying_revision_sha256=NULL,applying_plan_json=NULL"} WHERE organization_id=? AND set_id=? AND lease_token=?`,
      ).bind(
        code,
        failures,
        new Date(
          now() +
            (deferred
              ? HOUR
              : Math.min(DAY, HOUR * 2 ** Math.min(5, failures - 1))),
        ).toISOString(),
        source.organization_id,
        source.id,
        lease,
      ),
    ];
    if (code === "BINDING_CHANGED" || code === "EXCLUSION_CHANGED")
      statements.unshift(
        env.DB.prepare(
          "UPDATE verified_fax_reference_sets SET status='revoked' WHERE organization_id=? AND id=? AND status='active' AND EXISTS(SELECT 1 FROM verified_fax_reference_state WHERE organization_id=? AND set_id=? AND lease_token=?)",
        ).bind(
          source.organization_id,
          source.id,
          source.organization_id,
          source.id,
          lease,
        ),
      );
    await env.DB.batch(statements);
  };
  try {
    const started = at();
    candidate = await env.DB.prepare(
      "SELECT source.*,sender.address AS sender_address,state.failure_count,state.applying_revision_sha256,state.applying_plan_json,EXISTS(SELECT 1 FROM valid_verified_fax_reference_sets valid WHERE valid.organization_id=source.organization_id AND valid.id=source.id) AS valid_source FROM verified_fax_reference_sets source JOIN verified_fax_reference_state state ON state.organization_id=source.organization_id AND state.set_id=source.id LEFT JOIN senders sender ON sender.organization_id=source.organization_id AND sender.id=source.sender_id WHERE source.status='active' AND state.next_due_at<=? AND (state.lease_until IS NULL OR state.lease_until<=?) ORDER BY state.next_due_at,source.created_at,source.id LIMIT 1",
    )
      .bind(started, started)
      .first<Candidate>();
    if (!candidate) return counts;
    source = sourceOnly(candidate);
    lease = crypto.randomUUID();
    const claimed = await env.DB.prepare(
      "UPDATE verified_fax_reference_state SET lease_token=?,lease_until=?,last_attempt_at=? WHERE organization_id=? AND set_id=? AND next_due_at<=? AND (lease_until IS NULL OR lease_until<=?)",
    )
      .bind(
        lease,
        new Date(now() + 180_000).toISOString(),
        started,
        source.organization_id,
        source.id,
        started,
        started,
      )
      .run();
    if (claimed.meta.changes !== 1) {
      counts.tariffRefreshDeferred++;
      return counts;
    }
    // Claiming a new token fences any delayed earlier transaction before its
    // first mutation. Reconcile the same durable plan before reading new rates.
    if (candidate.applying_plan_json) {
      let previous: Plan;
      try {
        previous = JSON.parse(candidate.applying_plan_json) as Plan;
        if (
          previous.source.organization_id !== source.organization_id ||
          previous.source.id !== source.id ||
          canonical(previous.source) !== canonical(source) ||
          previous.revision !== candidate.applying_revision_sha256 ||
          previous.revision !==
            digest(
              canonical({
                ...previous.evidence,
                expiresAt: previous.expiresAt,
              }),
            ) ||
          digest(previous.address) !== source.sender_address_sha256 ||
          !Array.isArray(previous.next) ||
          previous.next.length !== 14
        )
          fail("COMMIT_UNCONFIRMED");
      } catch {
        fail("COMMIT_UNCONFIRMED");
      }
      let proven: boolean;
      try {
        proven = await committed(env.DB, previous);
      } catch {
        // Keep the durable plan and lease when its readback is unavailable.
        // A later claimant must fence this token and reconcile the same plan.
        counts.tariffRefreshFailed++;
        return counts;
      }
      if (proven) {
        await env.DB.prepare(
          "UPDATE verified_fax_reference_state SET lease_token=NULL,lease_until=NULL,applying_revision_sha256=NULL,applying_plan_json=NULL,last_error_code=NULL,failure_count=0,last_success_at=?,next_due_at=? WHERE organization_id=? AND set_id=? AND lease_token=?",
        )
          .bind(
            previous.observedAt,
            new Date(now() + DAY).toISOString(),
            source.organization_id,
            source.id,
            lease,
          )
          .run();
        counts.tariffsRefreshed = 14;
        return counts;
      }
      await finish("COMMIT_UNCONFIRMED");
      counts.tariffRefreshFailed++;
      return counts;
    }
    const anchors = JSON.parse(source.bindings_json) as Row[];
    const exclusions = JSON.parse(source.exclusions_json) as Row[];
    if (!candidate.valid_source) {
      const excluded = await env.DB.prepare(
        "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) ORDER BY destination_prefix",
      )
        .bind(source.organization_id, source.exclusions_json)
        .all<Row>();
      if (canonical(excluded.results) !== canonical(exclusions))
        fail("EXCLUSION_CHANGED");
      fail("BINDING_CHANGED");
    }
    const address = candidate.sender_address;
    if (
      typeof address !== "string" ||
      digest(address) !== source.sender_address_sha256
    )
      fail("BINDING_CHANGED");
    validateEeaFaxReferenceScope(anchors, exclusions);
    for (const row of [...anchors, ...exclusions]) columns(row);
    if (await hasQuotes(env.DB, source, started)) {
      await finish("QUOTE_ACTIVE", true);
      counts.tariffRefreshDeferred++;
      return counts;
    }
    const inventory = await env.DB.prepare(
      `WITH input AS (SELECT ? source) SELECT t.* FROM trusted_fax_usage_tariffs t,input WHERE ${inventoryPredicate(source, "t")} ORDER BY t.destination_prefix`,
    )
      .bind(JSON.stringify(source))
      .all<Row>();
    const current = inventory.results.filter((row) => row.route_allowed === 1);
    const denied = inventory.results.filter((row) => row.route_allowed === 0);
    if (canonical(denied) !== canonical(exclusions)) fail("EXCLUSION_CHANGED");
    if (current.length !== 14 || inventory.results.length !== 18)
      fail("BINDING_CHANGED");
    const mappings = await env.DB.prepare(
      "SELECT tariff_id,binding_sha256 FROM verified_fax_reference_tariffs WHERE organization_id=? AND set_id=? AND tariff_id IN (SELECT value FROM json_each(?))",
    )
      .bind(
        source.organization_id,
        source.id,
        JSON.stringify(current.map((row) => row.id)),
      )
      .all<Row>();
    for (const row of current) {
      const anchor = anchors.find(
        (item) => item.destination_prefix === row.destination_prefix,
      );
      if (
        !anchor ||
        columns(row).some(
          (key) => !variableColumns.has(key) && row[key] !== anchor[key],
        ) ||
        row.status !== "qualified" ||
        row.call_nano_usd !== 0 ||
        !mappings.results.some(
          (mapping) =>
            mapping.tariff_id === row.id &&
            mapping.binding_sha256 ===
              bindingHash(source!.organization_id, String(row.id)),
        )
      )
        fail("BINDING_CHANGED");
    }
    const account = env.TELNYX_PUBLIC_KEY
      ? await telnyxAccountReference(env.TELNYX_PUBLIC_KEY)
      : null;
    if (
      !env.TELNYX_API_KEY ||
      !account ||
      (env.TELNYX_ACCOUNT_ID && env.TELNYX_ACCOUNT_ID !== account) ||
      source.account_id !== account ||
      source.connection_id !== env.TELNYX_CONNECTION_ID ||
      source.outbound_profile_id !== env.TELNYX_OUTBOUND_VOICE_PROFILE_ID ||
      address !== env.TELNYX_FROM
    )
      fail("PROVIDER_UNAVAILABLE");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requests = 0;
    let deckUrl: string | null = null;
    const fetcher = dependencies.fetcher ?? fetch;
    const safeFetch: typeof fetch = async (input, init = {}) => {
      const url = String(input);
      const api =
        url === "https://api.telnyx.com/v2/tariffs" ||
        /^https:\/\/api\.telnyx\.com\/v2\/(?:fax_applications\/\d+|outbound_voice_profiles\/\d+|phone_numbers\?[^#]*)$/.test(
          url,
        );
      const headers = new Headers(init.headers);
      if (
        (init.method ?? "GET").toUpperCase() !== "GET" ||
        ++requests > 12 ||
        (!api && (headers.has("authorization") || headers.has("cookie"))) ||
        !(api || url === PAGE || url === FX || url === deckUrl)
      )
        fail("SOURCE_INVALID");
      try {
        return await fetcher(url, {
          ...init,
          method: "GET",
          redirect: "manual",
          signal: init.signal
            ? AbortSignal.any([controller.signal, init.signal])
            : controller.signal,
        });
      } catch (error) {
        if (error instanceof RefreshError) throw error;
        fail(
          controller.signal.aborted || init.signal?.aborted
            ? "SOURCE_TIMEOUT"
            : "SOURCE_HTTP",
        );
      }
    };
    const response = async (url: string) => {
      const result = await safeFetch(url);
      if (result.status !== 200 || (result.url && result.url !== url)) {
        await result.body?.cancel();
        fail("SOURCE_HTTP");
      }
      return result;
    };
    counts.networkAttempted = true;
    let evidence: Record<string, unknown>;
    let parsed: Awaited<ReturnType<typeof parseEeaFaxRateDeck>>;
    let pagePrice: number;
    let fx: ReturnType<typeof parseReferenceFx>;
    try {
      const collected = await Promise.race([
        (async () => {
          const catalog = await readCurrentFaxTariffCatalog(
            env.TELNYX_API_KEY!,
            safeFetch,
            controller.signal,
          );
          deckUrl = catalog.rateDeckUrl;
          const catalogObservedAt = at();
          const [deckResponse, pageResponse, fxResponse, inspection] =
            await Promise.all([
              response(deckUrl),
              response(PAGE),
              response(FX),
              (dependencies.inspect ?? inspectTelnyxReadiness)(
                {
                  apiKey: env.TELNYX_API_KEY!,
                  connectionId: source!.connection_id,
                  canonicalWebhookUrl: "https://guteneo.com/webhooks/telnyx",
                },
                safeFetch,
              ),
            ]);
          if (!owns(inspection, source!, address)) fail("PROVIDER_UNAVAILABLE");
          const [deck, page, fxBytes] = await Promise.all([
            parseEeaFaxRateDeck(
              chunks(deckResponse, 40 * 1024 * 1024, controller.signal),
              anchors,
              exclusions,
            ),
            bytes(pageResponse, 512 * 1024, controller.signal),
            bytes(fxResponse, 128 * 1024, controller.signal),
          ]);
          const observedAt = at();
          const pagePrice = parseReferencePagePrice(page);
          const fx = parseReferenceFx(fxBytes, observedAt);
          return {
            parsed: deck,
            pagePrice,
            fx,
            evidence: {
              version: 1,
              commercialBasis: source!.commercial_basis,
              sourceSha256: digest(canonical(source)),
              senderAddressSha256: source!.sender_address_sha256,
              predecessors: current.map((row) => ({
                id: row.id,
                sha256: digest(canonical(row)),
              })),
              exclusionsSha256: digest(canonical(exclusions)),
              catalog: { ...catalog, observedAt: catalogObservedAt },
              deck: {
                url: deckUrl,
                sha256: deck.sha256,
                bytes: deck.bytes,
                relevantRows: deck.relevantRows,
                lastModified: deckResponse.headers.get("last-modified"),
              },
              page: { url: PAGE, sha256: digest(page), bytes: page.byteLength },
              routes: deck.routes,
              pageNanoUsd: pagePrice,
              fxRate: fx,
              fx: {
                url: FX,
                sha256: digest(fxBytes),
                bytes: fxBytes.byteLength,
              },
              inspectedAt: observedAt,
              inspectionSha256: digest(canonical(inspection)),
              observedAt,
              callFeeBasis:
                "no_additional_reference_component_blank_is_not_zero_supplier_cost",
            },
          };
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new RefreshError("SOURCE_TIMEOUT"));
          }, 90_000);
        }),
      ]);
      ({ evidence, parsed, pagePrice, fx } = collected);
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
    }
    const observedAt = String(evidence.observedAt);
    const lifetime = Math.min(
      7 * DAY,
      ...anchors.map(
        (row) =>
          Date.parse(String(row.expires_at)) -
          Date.parse(String(row.valid_from)),
      ),
    );
    if (!Number.isSafeInteger(lifetime) || lifetime <= 0)
      fail("BINDING_CHANGED");
    const expiresAt = new Date(Date.parse(observedAt) + lifetime).toISOString();
    const revision = digest(canonical({ ...evidence, expiresAt }));
    const next = current.map((row, index): Row => {
      const route = parsed.routes.find(
        (value) => value.destinationPrefix === row.destination_prefix,
      );
      if (!route) fail("SOURCE_INVALID");
      return {
        ...row,
        id: `verified_ref_${revision.slice(0, 32)}_${index}`,
        page_nano_usd: pagePrice,
        minute_nano_usd: route.minuteNanoUsd,
        call_nano_usd: 0,
        fx_numerator: fx.numerator,
        fx_denominator: fx.denominator,
        fx_date: fx.date,
        fx_source: fx.source,
        source_reference: `automatic-public-reference:sha256:${revision}`,
        source_sha256: revision,
        valid_from: observedAt,
        expires_at: expiresAt,
        created_at: observedAt,
      };
    });
    plan = {
      source,
      address,
      current,
      exclusions,
      next,
      revision,
      observedAt,
      expiresAt,
      evidence,
    };
    const saved = await env.DB.prepare(
      "UPDATE verified_fax_reference_state SET applying_revision_sha256=?,applying_plan_json=? WHERE organization_id=? AND set_id=? AND lease_token=? AND lease_until>? AND applying_revision_sha256 IS NULL",
    )
      .bind(
        revision,
        canonical(plan),
        source.organization_id,
        source.id,
        lease,
        at(),
      )
      .run();
    if (saved.meta.changes !== 1) fail("COMMIT_CHANGED");
    const commitNonce = crypto.randomUUID();
    const committedAt = at();
    const payload = JSON.stringify({
      ...plan,
      at: committedAt,
      lease,
      commitNonce,
    });
    // Only the internal dependency injection used by deterministic tests can
    // replace this clock. Production compares the lease and evidence validity
    // at SQL execution, including time spent waiting in the database queue.
    const clock = dependencies.now
      ? "json_extract(plan,'$.at')"
      : "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
    const input = `WITH raw AS (SELECT ? plan),input AS (SELECT json_extract(plan,'$.source') source,json_extract(plan,'$.current') current,json_extract(plan,'$.exclusions') exclusions,json_extract(plan,'$.at') at,json_extract(plan,'$.observedAt') observedAt,json_extract(plan,'$.expiresAt') expiresAt,${clock} clock FROM raw) `;
    const fullMatch = conjunction(
      columns(current[0]).map(
        (key) => `prior.${key} IS json_extract(expected.value,'$.${key}')`,
      ),
    );
    const sourceMatch = conjunction(
      Object.keys(source).map(
        (key) => `valid.${key} IS json_extract(input.source,'$.${key}')`,
      ),
    );
    const fence =
      "EXISTS(SELECT 1 FROM verified_fax_reference_state state WHERE state.organization_id=? AND state.set_id=? AND state.lease_token=? AND state.applying_revision_sha256=?)";
    const fenceValues = [
      source.organization_id,
      source.id,
      commitNonce,
      revision,
    ];
    const prefix = "WITH input AS (SELECT ? plan) ";
    const nextColumns = columns(next[0]);
    const statements = [
      env.DB.prepare(
        `${input}UPDATE verified_fax_reference_state SET lease_token=? WHERE organization_id=? AND set_id=? AND lease_token=? AND applying_revision_sha256=? AND applying_plan_json=? AND lease_until>(SELECT clock FROM input) AND (SELECT observedAt<=clock AND expiresAt>clock FROM input) AND EXISTS(SELECT 1 FROM input JOIN valid_verified_fax_reference_sets valid WHERE ${sourceMatch}) AND EXISTS(SELECT 1 FROM senders sender WHERE sender.organization_id=? AND sender.id=? AND sender.address=? AND sender.status='verified' AND sender.mode='production' AND sender.channel='fax') AND NOT EXISTS(SELECT 1 FROM input,json_each(input.current) expected WHERE NOT EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs prior WHERE ${fullMatch})) AND NOT EXISTS(SELECT 1 FROM input,trusted_fax_usage_tariffs t WHERE ${inventoryPredicate(source, "t")} AND t.id NOT IN (SELECT json_extract(value,'$.id') FROM json_each(input.current) UNION ALL SELECT json_extract(value,'$.id') FROM json_each(input.exclusions))) AND NOT EXISTS(SELECT 1 FROM input WHERE ${quotePredicate(source)})`,
      ).bind(
        payload,
        commitNonce,
        source.organization_id,
        source.id,
        lease,
        revision,
        canonical(plan),
        source.organization_id,
        source.sender_id,
        address,
      ),
      env.DB.prepare(
        `UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND ${fence}`,
      ).bind(source.organization_id, JSON.stringify(current), ...fenceValues),
      env.DB.prepare(
        `${prefix}INSERT INTO trusted_fax_usage_tariffs(${nextColumns.join(",")}) SELECT ${nextColumns.map((key) => `json_extract(item.value,'$.${key}')`).join(",")} FROM input,json_each(json_extract(input.plan,'$.next')) item WHERE ${fence}`,
      ).bind(payload, ...fenceValues),
      env.DB.prepare(
        `${prefix}INSERT INTO verified_fax_reference_tariffs(organization_id,set_id,tariff_id,binding_sha256) SELECT ?,?,json_extract(value,'$.id'),json_extract(value,'$.binding') FROM input,json_each(?) WHERE ${fence}`,
      ).bind(
        payload,
        source.organization_id,
        source.id,
        JSON.stringify(
          next.map((row) => ({
            id: row.id,
            binding: bindingHash(source!.organization_id, String(row.id)),
          })),
        ),
        ...fenceValues,
      ),
      env.DB.prepare(
        `INSERT INTO verified_fax_reference_evidence(organization_id,set_id,revision_sha256,observed_at,expires_at,evidence_json,tariff_ids_json) SELECT ?,?,?,?,?,?,? WHERE ${fence}`,
      ).bind(
        source.organization_id,
        source.id,
        revision,
        observedAt,
        expiresAt,
        canonical(evidence),
        canonical(next.map((row) => row.id)),
        ...fenceValues,
      ),
      env.DB.prepare(
        `UPDATE verified_fax_reference_state SET lease_token=NULL,lease_until=NULL,applying_revision_sha256=NULL,applying_plan_json=NULL,last_success_at=?,last_error_code=NULL,failure_count=0,next_due_at=? WHERE organization_id=? AND set_id=? AND lease_token=? AND applying_revision_sha256=? AND EXISTS(SELECT 1 FROM verified_fax_reference_evidence WHERE organization_id=? AND set_id=? AND revision_sha256=?)`,
      ).bind(
        committedAt,
        new Date(now() + DAY).toISOString(),
        ...fenceValues,
        source.organization_id,
        source.id,
        revision,
      ),
    ];
    batchAttempted = true;
    const results = await env.DB.batch(statements);
    if (results[results.length - 1].meta.changes !== 1) {
      if (await hasQuotes(env.DB, source, at())) {
        await finish("QUOTE_ACTIVE", true);
        counts.tariffRefreshDeferred++;
        return counts;
      }
      fail("COMMIT_CHANGED");
    }
    counts.tariffsRefreshed = 14;
  } catch (error) {
    if (plan && batchAttempted) {
      try {
        if (await committed(env.DB, plan)) {
          counts.tariffsRefreshed = 14;
          return counts;
        }
      } catch {
        // Preserve the exact pending plan. A later lease fences and reconciles it.
        counts.tariffRefreshFailed++;
        return counts;
      }
    }
    const code: Code =
      error instanceof RefreshError || error instanceof FaxReferenceSourceError
        ? error.code
        : error &&
            typeof error === "object" &&
            "code" in error &&
            [
              "SOURCE_HTTP",
              "SOURCE_TOO_LARGE",
              "SOURCE_INVALID",
              "SOURCE_TIMEOUT",
              "PROVIDER_UNAVAILABLE",
            ].includes(String(error.code))
          ? (error.code as Code)
          : "DATABASE_UNAVAILABLE";
    counts.tariffRefreshFailed++;
    try {
      await finish(code, false, batchAttempted);
    } catch {
      // No write retry after an unknown result; the bounded lease is recoverable.
    }
  }
  return counts;
}
