import { createHash } from "node:crypto";
import {
  inspectTelnyxReadiness,
  telnyxAccountReference,
  type TelnyxReadiness,
} from "../../../packages/providers/telnyx-readiness";
import type { FaxUsageTariff } from "../../../packages/domain/src/live-fax-usage";
import type { Env } from "./env";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SOURCES = {
  catalog: "https://api.telnyx.com/v2/tariffs",
  page: "https://telnyx.com/pricing/fax",
  fx: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
} as const;
const DECK =
  /^https:\/\/portal\.telnyx\.com\/downloads\/global_conversational\/[A-Za-z0-9_-]+\.csv$/;
function validDeckUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= 1024 && DECK.test(value);
}
/** Portal-observed discovery contract, independently qualified at activation. */
export function parseFaxTariffCatalog(text: string): string {
  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    fail("SOURCE_INVALID");
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    fail("SOURCE_INVALID");
  const data = (result as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail("SOURCE_INVALID");
  const catalog = (data as Record<string, unknown>).global_conversational;
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog))
    fail("SOURCE_INVALID");
  const url = (catalog as Record<string, unknown>).tariff_link;
  if (!validDeckUrl(url)) fail("SOURCE_INVALID");
  return url;
}
const COLUMNS = [
  "ISO",
  "Country",
  "Origination Prefixes",
  "Destination Prefixes",
  "Description",
  "Interval 1",
  "Interval N",
  "Rate",
  "Price Per Call",
  "Exact Match",
];
type FailureCode =
  | "SOURCE_HTTP"
  | "SOURCE_TOO_LARGE"
  | "SOURCE_INVALID"
  | "SOURCE_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "BINDING_CHANGED"
  | "QUOTE_ACTIVE"
  | "COMMIT_CHANGED"
  | "DATABASE_UNAVAILABLE"
  | "AUTHORITY_EXPIRED";
class RefreshError extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
  }
}
function fail(code: FailureCode): never {
  throw new RefreshError(code);
}
const digest = (value: string) =>
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
function integerRate(value: string, places = 9): number {
  if (!new RegExp(`^\\d{1,8}(?:\\.\\d{1,${places}})?$`).test(value))
    fail("SOURCE_INVALID");
  const [whole, fraction = ""] = value.split(".");
  const result =
    BigInt(whole) * 10n ** BigInt(places) +
    BigInt(fraction.padEnd(places, "0"));
  if (result > 1_000_000_000n) fail("SOURCE_INVALID");
  return Number(result);
}

/** Incremental CSV parsing retains one bounded row and the one exact registered route. */
export async function parseFaxRateDeck(
  chunks: AsyncIterable<Uint8Array>,
  prefix: string,
) {
  if (prefix !== "+3524") fail("SOURCE_INVALID");
  const hash = createHash("sha256"),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    field = "",
    row: string[] = [],
    rowSize = 0,
    header = false,
    skipLf = false;
  let mode: "start" | "plain" | "quoted" | "closed" = "start";
  let match:
    | { minuteNanoUsd: number; initialSeconds: 60; incrementSeconds: 60 }
    | undefined;
  const finishField = () => {
    row.push(field);
    field = "";
    mode = "start";
  };
  const finishRow = () => {
    finishField();
    const fields = row;
    row = [];
    rowSize = 0;
    if (fields.length === 1 && fields[0] === "") return;
    if (!header) {
      fields[0] = fields[0].replace(/^\uFEFF/, "");
      if (canonical(fields) !== canonical(COLUMNS)) fail("SOURCE_INVALID");
      header = true;
      return;
    }
    if (fields.length !== COLUMNS.length) fail("SOURCE_INVALID");
    if (fields[0] !== "LU" || fields[2].trim().toLowerCase() !== "local")
      return;
    const numberPrefix = fields[3].trim();
    if (!/^352\d*$/.test(numberPrefix)) fail("SOURCE_INVALID");
    if (
      numberPrefix.startsWith(prefix.slice(1)) &&
      numberPrefix.length > prefix.length - 1
    )
      fail("SOURCE_INVALID");
    if (`+${numberPrefix}` !== prefix) return;
    if (
      match ||
      fields[4] !== "Trunking Outbound Minute - Luxembourg - Fixed - Local" ||
      fields[5].trim() !== "60" ||
      fields[6].trim() !== "60" ||
      fields[8].trim() !== "" ||
      fields[9].trim() !== ""
    )
      fail("SOURCE_INVALID");
    match = {
      minuteNanoUsd: integerRate(fields[7].trim()),
      initialSeconds: 60,
      incrementSeconds: 60,
    };
  };
  const consume = (text: string) => {
    for (const character of text) {
      if (skipLf) {
        skipLf = false;
        if (character === "\n") continue;
      }
      const codePoint = character.codePointAt(0)!;
      rowSize +=
        codePoint <= 0x7f
          ? 1
          : codePoint <= 0x7ff
            ? 2
            : codePoint <= 0xffff
              ? 3
              : 4;
      if (rowSize > 65_536) fail("SOURCE_TOO_LARGE");
      if (mode === "quoted") {
        if (character === '"') mode = "closed";
        else field += character;
        continue;
      }
      if (mode === "closed" && character === '"') {
        field += '"';
        mode = "quoted";
        continue;
      }
      if (character === ",") {
        finishField();
        continue;
      }
      if (character === "\r" || character === "\n") {
        finishRow();
        skipLf = character === "\r";
        continue;
      }
      if (mode === "closed") fail("SOURCE_INVALID");
      if (character === '"') {
        if (mode !== "start") fail("SOURCE_INVALID");
        mode = "quoted";
        continue;
      }
      field += character;
      mode = "plain";
    }
  };
  try {
    for await (const chunk of chunks) {
      bytes += chunk.byteLength;
      if (bytes > 40 * 1024 * 1024) fail("SOURCE_TOO_LARGE");
      hash.update(chunk);
      consume(decoder.decode(chunk, { stream: true }));
    }
    consume(decoder.decode());
  } catch (error) {
    if (error instanceof RefreshError) throw error;
    fail("SOURCE_INVALID");
  }
  const finalMode = mode as string;
  if (finalMode === "quoted") fail("SOURCE_INVALID");
  if (field || row.length || finalMode === "closed") finishRow();
  const found = match as
    | { minuteNanoUsd: number; initialSeconds: 60; incrementSeconds: 60 }
    | undefined;
  if (!header || !found) fail("SOURCE_INVALID");
  return { ...found, sha256: hash.digest("hex"), bytes };
}

export function parseFaxPagePrice(html: string): number {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
  const prices = [
    ...text.matchAll(
      /Send a fax via API\s*\$([\d.]+)\s*per page\s*\+\s*SIP Trunking\s*usage for transmission/gi,
    ),
  ];
  if (prices.length !== 1) fail("SOURCE_INVALID");
  const price = integerRate(prices[0][1]);
  if (!price) fail("SOURCE_INVALID");
  return price;
}
export function parseFaxFx(xml: string, observedAt: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail("SOURCE_INVALID");
  const dates = [
    ...xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/g),
  ];
  const rates = [
    ...xml.matchAll(
      /<Cube\s+currency=['"]USD['"]\s+rate=['"](\d+\.\d+)['"]\s*\/>/g,
    ),
  ];
  if (dates.length !== 1 || rates.length !== 1) fail("SOURCE_INVALID");
  const date = dates[0][1],
    parsed = new Date(date),
    today = observedAt.slice(0, 10);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    date > today ||
    Date.parse(today) - parsed.getTime() > 7 * DAY
  )
    fail("SOURCE_INVALID");
  const [whole, fraction] = rates[0][1].split(".");
  if (whole.length > 8 || fraction.length > 6) fail("SOURCE_INVALID");
  let numerator = 10n ** BigInt(fraction.length),
    denominator = BigInt(whole + fraction);
  if (!denominator) fail("SOURCE_INVALID");
  const gcd = (a: bigint, b: bigint): bigint => (b ? gcd(b, a % b) : a);
  const common = gcd(numerator, denominator);
  numerator /= common;
  denominator /= common;
  if (numerator > 1_000_000n || denominator > 1_000_000n)
    fail("SOURCE_INVALID");
  return {
    date,
    numerator: Number(numerator),
    denominator: Number(denominator),
    source: SOURCES.fx,
  };
}

type Source = {
  id: string;
  organization_id: string;
  sender_id: string;
  initial_tariff_id: string;
  account_id: string;
  connection_id: string;
  outbound_profile_id: string;
  destination_prefix: string;
  options_json: string;
  tariff_catalog: "global_conversational";
  rate_deck_url: string;
  authorization_expires_at: string;
  authorization_reference: string;
  commercial_basis: "public_reference_not_negotiated";
  status: "active" | "revoked";
  created_at: string;
  sender_address: string;
  failure_count: number;
};
export type FaxTariffRefreshCounts = {
  tariffsRefreshed: number;
  tariffRefreshFailed: number;
  tariffRefreshDeferred: number;
};
type Dependencies = {
  fetcher?: typeof fetch;
  now?: () => number;
  inspect?: typeof inspectTelnyxReadiness;
};
const totals = (): FaxTariffRefreshCounts => ({
  tariffsRefreshed: 0,
  tariffRefreshFailed: 0,
  tariffRefreshDeferred: 0,
});
const scopeColumns = [
  "organization_id",
  "sender_id",
  "account_id",
  "connection_id",
  "outbound_profile_id",
  "destination_prefix",
  "options_json",
] as const;
function scope(source: Source, alias: string) {
  return {
    sql: scopeColumns.map((key) => `${alias}.${key}=?`).join(" AND "),
    values: scopeColumns.map((key) => source[key]),
  };
}
function rowMatch(row: Record<string, unknown>, alias: string) {
  const columns = Object.keys(row);
  if (!columns.every((key) => /^[a-z_][a-z0-9_]*$/.test(key)))
    fail("BINDING_CHANGED");
  return {
    sql: columns.map((key) => `${alias}.${key} IS ?`).join(" AND "),
    values: columns.map((key) => row[key]),
  };
}
function quoteGuard(source: Source, now: string) {
  const route = scope(source, "t");
  return {
    sql: `EXISTS(SELECT 1 FROM live_fax_quotes_v3 q JOIN trusted_fax_usage_tariffs t ON t.organization_id=q.organization_id AND t.id=q.tariff_id JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id WHERE ${route.sql} AND (d.status IN ('queued','submitting','submission_unknown') OR (d.status='prepared' AND q.expires_at>?)))`,
    values: [...route.values, now],
  };
}
async function* bodyChunks(
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
  let bytes = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const part = await reader.read();
      if (signal.aborted) fail("SOURCE_TIMEOUT");
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) fail("SOURCE_TOO_LARGE");
      yield part.value;
    }
    if (!bytes) fail("SOURCE_INVALID");
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
  }
}
async function collectText(
  response: Response,
  maximum: number,
  signal: AbortSignal,
) {
  const hash = createHash("sha256"),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  for await (const chunk of bodyChunks(response, maximum, signal)) {
    hash.update(chunk);
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return { text, sha256: hash.digest("hex") };
}

/** One fixed authenticated GET; never retrieve a hosted key or follow a redirect. */
export async function readCurrentFaxTariffCatalog(
  apiKey: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<{ rateDeckUrl: string; sha256: string }> {
  if (typeof apiKey !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(apiKey))
    fail("PROVIDER_UNAVAILABLE");
  if (signal?.aborted) fail("SOURCE_TIMEOUT");
  const controller = new AbortController();
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      controller.abort();
      reject(new RefreshError("SOURCE_TIMEOUT"));
    };
  });
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 10_000);
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(SOURCES.catalog, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
          redirect: "manual",
          signal: controller.signal,
        });
        if (
          response.status !== 200 ||
          (response.url && response.url !== SOURCES.catalog)
        ) {
          await response.body?.cancel();
          fail("SOURCE_HTTP");
        }
        const result = await collectText(
          response,
          128 * 1024,
          controller.signal,
        );
        return {
          rateDeckUrl: parseFaxTariffCatalog(result.text),
          sha256: result.sha256,
        };
      })(),
      cancelled,
    ]);
  } catch (error) {
    if (error instanceof RefreshError) throw error;
    throw new RefreshError(
      controller.signal.aborted ? "SOURCE_TIMEOUT" : "SOURCE_HTTP",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}

export type FaxTariffCatalogInspection = {
  provider: "telnyx";
  mode: "read_only";
  catalog: "global_conversational";
} & (
  | { status: "ok"; rateDeckUrl: string; sha256: string; observedAt: string }
  | { status: "unavailable"; code: FailureCode | "CONFIGURATION_REQUIRED" }
);

/** Private same-account qualification: no database access, writes or key disclosure. */
export async function inspectTelnyxFaxTariffCatalog(
  env: Env,
  dependencies: Pick<Dependencies, "fetcher" | "now"> = {},
): Promise<FaxTariffCatalogInspection> {
  const identity = {
    provider: "telnyx",
    mode: "read_only",
    catalog: "global_conversational",
  } as const;
  if (
    env.MODE !== "production" ||
    env.ENVIRONMENT !== "production" ||
    !env.TELNYX_API_KEY
  )
    return {
      ...identity,
      status: "unavailable",
      code: "CONFIGURATION_REQUIRED",
    };
  try {
    const result = await readCurrentFaxTariffCatalog(
      env.TELNYX_API_KEY,
      dependencies.fetcher,
    );
    return {
      ...identity,
      status: "ok",
      ...result,
      observedAt: new Date((dependencies.now ?? Date.now)()).toISOString(),
    };
  } catch (error) {
    return {
      ...identity,
      status: "unavailable",
      code: error instanceof RefreshError ? error.code : "SOURCE_HTTP",
    };
  }
}
function ownership(result: TelnyxReadiness, source: Source) {
  const partial =
    result.status === "partial" &&
    result.errors.length === 1 &&
    result.errors[0].stage === "outbound_profile" &&
    result.errors[0].code === "invalid_response" &&
    canonical(result.errors[0].invalidFields) === '["daily_spend_limit"]';
  return (
    result.provider === "telnyx" &&
    result.mode === "read_only" &&
    (result.status === "ok" || partial) &&
    result.application?.id === source.connection_id &&
    result.application.active &&
    result.application.outboundVoiceProfileId === source.outbound_profile_id &&
    result.outboundProfile?.id === source.outbound_profile_id &&
    result.outboundProfile.enabled &&
    result.outboundProfile.whitelistedDestinations?.includes("LU") &&
    result.numberPagination.complete &&
    result.numbers.some(
      (number) =>
        number.phoneNumber === source.sender_address &&
        number.country === "LU" &&
        number.status === "active" &&
        number.features.t38FaxGatewayEnabled === true,
    )
  );
}

/** One registered route per invocation. Remote requests are GET-only and bounded. */
export async function refreshFaxTariffs(
  env: Env,
  dependencies: Dependencies = {},
): Promise<FaxTariffRefreshCounts> {
  const counts = totals();
  if (
    env.MODE !== "production" ||
    env.ENVIRONMENT !== "production" ||
    !env.TELNYX_API_KEY ||
    !env.TELNYX_PUBLIC_KEY ||
    !env.TELNYX_CONNECTION_ID ||
    !env.TELNYX_OUTBOUND_VOICE_PROFILE_ID
  )
    return counts;
  const account = await telnyxAccountReference(env.TELNYX_PUBLIC_KEY);
  if (!account || (env.TELNYX_ACCOUNT_ID && env.TELNYX_ACCOUNT_ID !== account))
    return counts;
  const now = dependencies.now ?? Date.now,
    fetcher = dependencies.fetcher ?? fetch;
  const at = () => new Date(now()).toISOString();
  let source: Source | null = null,
    lease: string | null = null;
  let planned: { id: string; sha256: string } | null = null;
  const finish = async (code: FailureCode, deferred = false) => {
    if (!source || !lease) return;
    const failures = Math.min(16, source.failure_count + (deferred ? 0 : 1));
    await env.DB.prepare(
      "UPDATE fax_tariff_refresh_state SET lease_token=NULL,lease_until=NULL,applying_tariff_id=NULL,last_error_code=?,failure_count=?,next_due_at=? WHERE organization_id=? AND source_id=? AND lease_token=?",
    )
      .bind(
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
      )
      .run();
  };
  try {
    const started = at();
    source = await env.DB.prepare(
      "SELECT source.*,sender.address AS sender_address,state.failure_count FROM valid_fax_tariff_refresh_sources source JOIN fax_tariff_refresh_state state ON state.organization_id=source.organization_id AND state.source_id=source.id JOIN senders sender ON sender.organization_id=source.organization_id AND sender.id=source.sender_id WHERE source.authorization_expires_at>? AND state.next_due_at<=? AND (state.lease_until IS NULL OR state.lease_until<=?) ORDER BY state.next_due_at,source.created_at,source.id LIMIT 1",
    )
      .bind(started, started, started)
      .first<Source>();
    if (!source) return counts;
    lease = crypto.randomUUID();
    const acquired = await env.DB.prepare(
      "UPDATE fax_tariff_refresh_state SET lease_token=?,lease_until=?,last_attempt_at=?,applying_tariff_id=NULL WHERE organization_id=? AND source_id=? AND next_due_at<=? AND (lease_until IS NULL OR lease_until<=?)",
    )
      .bind(
        lease,
        new Date(now() + 60_000).toISOString(),
        started,
        source.organization_id,
        source.id,
        started,
        started,
      )
      .run();
    if (acquired.meta.changes !== 1) {
      counts.tariffRefreshDeferred++;
      return counts;
    }
    if (
      source.account_id !== account ||
      source.connection_id !== env.TELNYX_CONNECTION_ID ||
      source.outbound_profile_id !== env.TELNYX_OUTBOUND_VOICE_PROFILE_ID ||
      source.tariff_catalog !== "global_conversational" ||
      !validDeckUrl(source.rate_deck_url)
    )
      fail("BINDING_CHANGED");
    const activeQuotes = quoteGuard(source, started);
    if (
      await env.DB.prepare(`SELECT 1 WHERE ${activeQuotes.sql}`)
        .bind(...activeQuotes.values)
        .first()
    ) {
      await finish("QUOTE_ACTIVE", true);
      counts.tariffRefreshDeferred++;
      return counts;
    }
    const route = scope(source, "t");
    const current = await env.DB.prepare(
      `SELECT t.* FROM trusted_fax_usage_tariffs t WHERE ${route.sql} AND t.status='qualified' LIMIT 1`,
    )
      .bind(...route.values)
      .first<FaxUsageTariff>();
    const anchor = await env.DB.prepare(
      "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=?",
    )
      .bind(source.organization_id, source.initial_tariff_id)
      .first<FaxUsageTariff>();
    if (!current || !anchor || current.execution_scope !== "live")
      fail("BINDING_CHANGED");
    for (const key of [
      "provider",
      "sender_prefix",
      "sender_country_code",
      "destination_country_code",
      "origin_class",
      "destination_category",
      "route_allowed",
      "local_calling_verified",
      "route_qualification",
      "operator_authorization_reference",
      "operator_test_ceiling_minor",
      "initial_seconds",
      "increment_seconds",
      "duration_base_seconds",
      "duration_low_per_page_seconds",
      "duration_high_per_page_seconds",
      "max_pages",
      "quote_ttl_seconds",
    ] as const)
      if (current[key] !== anchor[key]) fail("BINDING_CHANGED");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestCount = 0;
    let currentDeckUrl: string | null = null;
    const safeFetch: typeof fetch = async (input, init = {}) => {
      const url = String(input);
      const providerApi =
        url === SOURCES.catalog ||
        /^https:\/\/api\.telnyx\.com\/v2\/(?:fax_applications\/\d+|outbound_voice_profiles\/\d+|phone_numbers\?[^#]*)$/.test(
          url,
        );
      const headers = new Headers(init.headers);
      if (
        (init.method ?? "GET").toUpperCase() !== "GET" ||
        ++requestCount > 10 ||
        (!providerApi &&
          (headers.has("authorization") || headers.has("cookie"))) ||
        !(
          url === SOURCES.page ||
          url === SOURCES.fx ||
          url === currentDeckUrl ||
          providerApi
        )
      )
        fail("SOURCE_INVALID");
      return fetcher(url, {
        ...init,
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
    };
    const sourceResponse = async (url: string, init: RequestInit = {}) => {
      const response = await safeFetch(url, init);
      if (response.status !== 200 || (response.url && response.url !== url)) {
        await response.body?.cancel();
        fail("SOURCE_HTTP");
      }
      return response;
    };
    let evidence: {
      discovery: { sha256: string };
      rateDeckUrl: string;
      discoveryObservedAt: string;
      page: { text: string; sha256: string };
      deck: Awaited<ReturnType<typeof parseFaxRateDeck>>;
      fx: { text: string; sha256: string };
      observedAt: string;
      inspectedAt: string;
    };
    try {
      evidence = await Promise.race([
        (async () => {
          const discovery = await readCurrentFaxTariffCatalog(
            env.TELNYX_API_KEY!,
            safeFetch,
            controller.signal,
          );
          const rateDeckUrl = discovery.rateDeckUrl;
          const discoveryObservedAt = at();
          currentDeckUrl = rateDeckUrl;
          const [page, deck, fx, inspection] = await Promise.all([
            sourceResponse(SOURCES.page).then((response) =>
              collectText(response, 512 * 1024, controller.signal),
            ),
            sourceResponse(rateDeckUrl).then((response) =>
              parseFaxRateDeck(
                bodyChunks(response, 40 * 1024 * 1024, controller.signal),
                source!.destination_prefix,
              ),
            ),
            sourceResponse(SOURCES.fx).then((response) =>
              collectText(response, 128 * 1024, controller.signal),
            ),
            (dependencies.inspect ?? inspectTelnyxReadiness)(
              {
                apiKey: env.TELNYX_API_KEY!,
                connectionId: source!.connection_id,
                canonicalWebhookUrl: "https://guteneo.com/webhooks/telnyx",
              },
              safeFetch,
            ),
          ]);
          if (!ownership(inspection, source!)) fail("PROVIDER_UNAVAILABLE");
          return {
            discovery,
            rateDeckUrl,
            discoveryObservedAt,
            page,
            deck,
            fx,
            observedAt: started,
            inspectedAt: at(),
          };
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new RefreshError("SOURCE_TIMEOUT"));
          }, 30_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
    }
    const committedAt = at(),
      fx = parseFaxFx(evidence.fx.text, evidence.observedAt);
    const expiresAt = new Date(
      Math.min(
        Date.parse(evidence.observedAt) + 7 * DAY,
        Date.parse(source.authorization_expires_at),
      ),
    ).toISOString();
    if (expiresAt <= committedAt) fail("AUTHORITY_EXPIRED");
    const material = {
      basis: source.commercial_basis,
      binding: digest(canonical(source)),
      discovery: evidence.discovery.sha256,
      rateDeckUrl: evidence.rateDeckUrl,
      discoveryObservedAt: evidence.discoveryObservedAt,
      page: evidence.page.sha256,
      deck: evidence.deck.sha256,
      fx: evidence.fx.sha256,
      observedAt: evidence.observedAt,
      inspectedAt: evidence.inspectedAt,
    };
    const next: FaxUsageTariff = {
      ...current,
      id: `refresh_${crypto.randomUUID()}`,
      page_nano_usd: parseFaxPagePrice(evidence.page.text),
      minute_nano_usd: evidence.deck.minuteNanoUsd,
      call_nano_usd: 0,
      fx_numerator: fx.numerator,
      fx_denominator: fx.denominator,
      fx_date: fx.date,
      fx_source: fx.source,
      source_reference: `automatic-public-reference:sha256:${digest(canonical(material))}`,
      source_sha256: digest(canonical(material)),
      valid_from: evidence.observedAt,
      expires_at: expiresAt,
      created_at: committedAt,
    };
    planned = { id: next.id, sha256: next.source_sha256 };
    const previous = rowMatch(
        current as unknown as Record<string, unknown>,
        "prior",
      ),
      currentQuotes = quoteGuard(source, committedAt);
    const columns = Object.keys(next) as (keyof FaxUsageTariff)[];
    const stateWhere =
      "organization_id=? AND source_id=? AND lease_token=? AND applying_tariff_id=?";
    const stateValues = [source.organization_id, source.id, lease, next.id];
    const statements = [
      env.DB.prepare(
        `UPDATE fax_tariff_refresh_state SET applying_tariff_id=? WHERE organization_id=? AND source_id=? AND lease_token=? AND lease_until>? AND EXISTS(SELECT 1 FROM valid_fax_tariff_refresh_sources source WHERE source.organization_id=? AND source.id=? AND source.authorization_expires_at>?) AND EXISTS(SELECT 1 FROM senders sender WHERE sender.organization_id=? AND sender.id=? AND sender.address=? AND sender.status='verified' AND sender.mode='production' AND sender.channel='fax') AND EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs prior WHERE ${previous.sql}) AND NOT ${currentQuotes.sql}`,
      ).bind(
        next.id,
        source.organization_id,
        source.id,
        lease,
        committedAt,
        source.organization_id,
        source.id,
        committedAt,
        source.organization_id,
        source.sender_id,
        source.sender_address,
        ...previous.values,
        ...currentQuotes.values,
      ),
      env.DB.prepare(
        `UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=? AND EXISTS(SELECT 1 FROM fax_tariff_refresh_state WHERE ${stateWhere})`,
      ).bind(source.organization_id, current.id, ...stateValues),
      env.DB.prepare(
        `INSERT INTO trusted_fax_usage_tariffs(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE EXISTS(SELECT 1 FROM fax_tariff_refresh_state WHERE ${stateWhere})`,
      ).bind(...columns.map((column) => next[column]), ...stateValues),
      env.DB.prepare(
        `INSERT INTO fax_tariff_refresh_evidence(organization_id,source_id,tariff_id,previous_tariff_id,previous_tariff_sha256,discovery_sha256,rate_deck_url,discovery_observed_at,page_sha256,deck_sha256,fx_sha256,source_observed_at,profile_inspected_at,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM fax_tariff_refresh_state WHERE ${stateWhere})`,
      ).bind(
        source.organization_id,
        source.id,
        next.id,
        current.id,
        digest(canonical(current)),
        evidence.discovery.sha256,
        evidence.rateDeckUrl,
        evidence.discoveryObservedAt,
        evidence.page.sha256,
        evidence.deck.sha256,
        evidence.fx.sha256,
        evidence.observedAt,
        evidence.inspectedAt,
        committedAt,
        ...stateValues,
      ),
      env.DB.prepare(
        `UPDATE fax_tariff_refresh_state SET applying_tariff_id=NULL,lease_token=NULL,lease_until=NULL,last_success_at=?,last_error_code=NULL,failure_count=0,next_due_at=? WHERE ${stateWhere} AND EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=?)`,
      ).bind(
        committedAt,
        new Date(now() + DAY).toISOString(),
        ...stateValues,
        source.organization_id,
        next.id,
      ),
    ];
    const results = await env.DB.batch(statements);
    if (results[results.length - 1].meta.changes !== 1) fail("COMMIT_CHANGED");
    counts.tariffsRefreshed++;
  } catch (error) {
    // A lost database response can follow a committed transaction. Reconcile
    // this exact revision before altering its successful 24-hour schedule.
    if (source && planned) {
      try {
        const committed = await env.DB.prepare(
          "SELECT source_sha256 FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=? AND status='qualified'",
        )
          .bind(source.organization_id, planned.id)
          .first<{ source_sha256: string }>();
        if (committed?.source_sha256 === planned.sha256) {
          counts.tariffsRefreshed++;
          return counts;
        }
      } catch {
        /* No mutation is retried after an uncertain database response. */
      }
    }
    counts.tariffRefreshFailed++;
    try {
      await finish(
        error instanceof RefreshError ? error.code : "SOURCE_INVALID",
      );
    } catch {
      /* The expired lease remains recoverable; no unbounded retries. */
    }
  }
  return counts;
}
