import { createHash } from "node:crypto";
import {
  faxCatalogBucket,
  worldwideFaxScope,
  resolveWorldwideFaxReference,
  type CatalogEvidence,
} from "../../../packages/domain/src/worldwide-fax-catalog";
import {
  inspectTelnyxReadiness,
  telnyxAccountReference,
} from "../../../packages/providers/telnyx-readiness";
import {
  bodyChunks,
  collectText,
  parseFaxFx,
  parseFaxPagePrice,
  readCurrentFaxTariffCatalog,
  readFaxRateDeckRows,
} from "./fax-tariff-refresh";
import type { Env } from "./env";

const PAGE = "https://telnyx.com/pricing/fax";
const FX = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const DAY = 86_400_000;
const fingerprint = (input: string) =>
  createHash("sha256").update(input).digest("hex");
function invalid(): never {
  throw new Error("FAX_CATALOG_UNAVAILABLE");
}
function nanoUsd(input: string) {
  if (!/^\d{1,4}(\.\d{1,9})?$/.test(input)) invalid();
  const [whole, decimal = ""] = input.split(".");
  return Number(whole) * 1_000_000_000 + Number(decimal.padEnd(9, "0"));
}

/** Read every record; persist only the origin classes applicable to this exact,
 * provider-owned sender. Empty origins are the deck's ordinary default. */
export async function compileWorldwideFaxDeck(
  chunks: AsyncIterable<Uint8Array>,
  senderNumber: string,
  originCountry: string,
) {
  const buckets = new Map<string, string[]>();
  const countries = new Set<string>();
  const masks = new Map<string, number>();
  const sender = senderNumber.slice(1);
  let rows = 0,
    retainedRows = 0,
    retainedBytes = 0;
  const result = await readFaxRateDeckRows(chunks, (fields) => {
    const [iso, , originRaw, destRaw, , first, later, rawRate, rawCall, exact] =
      fields;
    const prefix = destRaw.trim(),
      origin = originRaw.trim().toLowerCase();
    if (
      ++rows > 500_000 ||
      !/^[A-Z]{2}(\/[A-Z]{2})*$/.test(iso) ||
      !/^[1-9][0-9X]{0,14}$/.test(prefix) ||
      !/^[1-9]\d{0,2}$/.test(first) ||
      !/^[1-9]\d{0,2}$/.test(later) ||
      !["", "YES"].includes(exact)
    )
      invalid();
    const minute = nanoUsd(rawRate.trim()),
      call = rawCall.trim() ? nanoUsd(rawCall.trim()) : 0;
    countries.add(iso);
    let originSpecificity = 0;
    if (origin === "local") {
      if (!iso.split("/").includes(originCountry)) return;
      originSpecificity = 16;
    } else if (origin) {
      let longest = masks.get(origin);
      if (longest === undefined) {
        if (masks.size >= 256) invalid();
        longest = -1;
        for (const entry of origin.split(",")) {
          const digits = entry.trim();
          if (!/^[1-9]\d{0,14}$/.test(digits)) invalid();
          if (sender.startsWith(digits))
            longest = Math.max(longest, digits.length);
        }
        masks.set(origin, longest);
      }
      if (longest < 0) return;
      originSpecificity = longest;
    }
    const bucket = faxCatalogBucket(prefix);
    let records = buckets.get(bucket);
    if (!records) {
      records = [];
      buckets.set(bucket, records);
    }
    const record = [
      prefix,
      iso,
      originSpecificity,
      exact === "YES" ? 1 : 0,
      minute,
      call,
      Number(first),
      Number(later),
    ].join("|");
    retainedBytes += record.length;
    if (++retainedRows > 250_000 || retainedBytes > 12 * 1024 * 1024) invalid();
    records.push(record);
  });
  return { ...result, rows, countries: [...countries].sort(), buckets };
}

type Dependencies = {
  now?: () => number;
  fetcher?: typeof fetch;
  inspect?: typeof inspectTelnyxReadiness;
  initialOnly?: true;
};
async function configuredBinding(env: Env) {
  if (
    !env.TELNYX_API_KEY ||
    !env.TELNYX_PUBLIC_KEY ||
    !env.TELNYX_CONNECTION_ID ||
    !env.TELNYX_OUTBOUND_VOICE_PROFILE_ID ||
    !env.TELNYX_FROM ||
    !env.TELNYX_ACCOUNT_ID
  )
    return null;
  const account = await telnyxAccountReference(env.TELNYX_PUBLIC_KEY);
  if (!account || env.TELNYX_ACCOUNT_ID !== account) return null;
  return {
    accountId: account,
    connectionId: env.TELNYX_CONNECTION_ID,
    outboundProfileId: env.TELNYX_OUTBOUND_VOICE_PROFILE_ID,
    senderNumber: env.TELNYX_FROM,
  };
}

/** Read the deployed sender scope without disclosing provider or customer identifiers. */
export async function inspectWorldwideFaxCatalog(env: Env) {
  if (
    env.MODE !== "production" ||
    env.ENVIRONMENT !== "production" ||
    env.TELNYX_FAX_DESTINATIONS !== "worldwide"
  )
    throw new Error("WORLDWIDE_FAX_CONFIGURATION_REQUIRED");
  const binding = await configuredBinding(env);
  if (!binding) throw new Error("WORLDWIDE_FAX_CONFIGURATION_REQUIRED");
  const row = await env.DB.prepare(
    `SELECT s.revision, s.next_due_at AS nextDueAt, s.lease_until AS leaseUntil, r.created_at AS observedAt, d.complete,
      json_extract(r.evidence_json,'$.rows') AS sourceRows,
      json_array_length(r.evidence_json,'$.countries') AS destinationGroups,
      (SELECT count(*) FROM worldwide_fax_catalog_buckets b WHERE b.deck_id=d.id) AS buckets
      FROM worldwide_fax_catalog_state s LEFT JOIN worldwide_fax_catalog_revisions r ON r.scope=s.scope AND r.id=s.revision
      LEFT JOIN worldwide_fax_catalog_decks d ON d.scope=s.scope AND d.id=r.deck_id WHERE s.scope=?`,
  )
    .bind(worldwideFaxScope(binding))
    .first<{
      revision: string | null;
      nextDueAt: string;
      leaseUntil: string | null;
      observedAt: string;
      complete: number;
      sourceRows: number;
      destinationGroups: number;
      buckets: number;
    }>();
  if (
    row?.revision &&
    (row.complete !== 1 ||
      row.sourceRows < 100000 ||
      row.destinationGroups < 190 ||
      !row.buckets)
  )
    throw new Error("FAX_CATALOG_INCONSISTENT");
  const active = Boolean(row?.revision);
  const lookups = active
    ? await Promise.all(
        [
          ["North American numbering plan", "+12025550100"],
          ["United Kingdom", "+442079460000"],
        ].map(async ([sample, destinationNumber]) => ({
          sample,
          matched: Boolean(
            await resolveWorldwideFaxReference(env.DB, {
              ...binding,
              destinationNumber,
            }),
          ),
        })),
      )
    : [];
  return {
    active,
    observedAt: row?.observedAt ?? null,
    nextDueAt: row?.nextDueAt ?? null,
    leaseUntil: row?.leaseUntil ?? null,
    sourceRows: row?.sourceRows ?? 0,
    destinationGroups: row?.destinationGroups ?? 0,
    buckets: row?.buckets ?? 0,
    lookups,
    workerVersionId: env.WRANGLER_VERSION_METADATA?.id ?? null,
  };
}

export async function initializeWorldwideFaxCatalog(
  env: Env,
  dependencies: Omit<Dependencies, "initialOnly"> = {},
) {
  const current = await inspectWorldwideFaxCatalog(env);
  if (current.active) return { result: "already_active", catalog: current };
  const counts = await refreshWorldwideFaxCatalog(env, {
    ...dependencies,
    initialOnly: true,
  });
  const catalog = await inspectWorldwideFaxCatalog(env);
  const result = counts.worldwideFaxCatalogRefreshed
    ? "initialized"
    : catalog.active
      ? "already_active"
      : counts.worldwideFaxCatalogFailed
        ? "source_unavailable"
        : "deferred";
  return { result, catalog };
}

export async function refreshWorldwideFaxCatalog(
  env: Env,
  dependencies: Dependencies = {},
) {
  const counts = {
    worldwideFaxCatalogRefreshed: 0,
    worldwideFaxCatalogFailed: 0,
  };
  if (env.MODE !== "production" || env.ENVIRONMENT !== "production")
    return counts;
  const binding = await configuredBinding(env);
  if (!binding) return { ...counts, worldwideFaxCatalogFailed: 1 };
  const key = env.TELNYX_API_KEY!;
  const scope = worldwideFaxScope(binding),
    lease = crypto.randomUUID();
  const now = dependencies.now ?? Date.now;
  const stamp = () => new Date(now()).toISOString();
  const later = (ms: number) => new Date(now() + ms).toISOString();
  const db = env.DB;
  await db
    .prepare(
      "INSERT OR IGNORE INTO worldwide_fax_catalog_state(scope,next_due_at) VALUES(?,?)",
    )
    .bind(scope, stamp())
    .run();
  const acquired = await db
    .prepare(
      `UPDATE worldwide_fax_catalog_state SET lease_token=?,lease_until=? WHERE scope=? AND next_due_at<=? AND (lease_until IS NULL OR lease_until<=?) AND (?=0 OR revision IS NULL)`,
    )
    .bind(
      lease,
      later(180_000),
      scope,
      stamp(),
      stamp(),
      dependencies.initialOnly ? 1 : 0,
    )
    .run();
  if (!acquired.meta.changes) return counts;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90_000);
  const fetcher: typeof fetch = async (url, init = {}) =>
    (dependencies.fetcher ?? fetch)(url, {
      ...init,
      redirect: "manual",
      signal: init.signal
        ? AbortSignal.any([init.signal, abort.signal])
        : abort.signal,
    });
  const get = async (url: string) => {
    const r = await fetcher(url, {
      headers: { "Accept-Encoding": "identity" },
    });
    if (r.status !== 200 || (r.url && r.url !== url)) {
      await r.body?.cancel();
      invalid();
    }
    return r;
  };
  try {
    // The only credentialed reads go through the existing fixed-host clients.
    const [discovery, profile, page, fx] = await Promise.all([
      readCurrentFaxTariffCatalog(key, fetcher, abort.signal),
      (dependencies.inspect ?? inspectTelnyxReadiness)(
        {
          apiKey: key,
          connectionId: binding.connectionId,
          canonicalWebhookUrl: "https://guteneo.com/webhooks/telnyx",
        },
        fetcher,
      ),
      get(PAGE).then((r) => collectText(r, 512 * 1024, abort.signal)),
      get(FX).then((r) => collectText(r, 128 * 1024, abort.signal)),
    ]);
    const number = profile.numbers.find(
      (n) =>
        n.phoneNumber === binding.senderNumber &&
        n.status === "active" &&
        n.features.t38FaxGatewayEnabled === true,
    );
    if (
      !number ||
      !profile.numberPagination.complete ||
      !profile.application?.active ||
      profile.application.id !== binding.connectionId ||
      profile.application.outboundVoiceProfileId !==
        binding.outboundProfileId ||
      profile.outboundProfile?.id !== binding.outboundProfileId ||
      !profile.outboundProfile.enabled
    )
      invalid();
    const deckResponse = await get(discovery.rateDeckUrl);
    const length = Number(deckResponse.headers.get("content-length"));
    // The portal serves a sized uncompressed CSV. Verify the entire entity so
    // a truncated but syntactically complete row prefix cannot be published.
    if (
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      length > 40 * 1024 * 1024 ||
      !["identity", null].includes(deckResponse.headers.get("content-encoding"))
    ) {
      await deckResponse.body?.cancel();
      invalid();
    }
    const deck = await compileWorldwideFaxDeck(
      bodyChunks(deckResponse, 40 * 1024 * 1024, abort.signal),
      binding.senderNumber,
      number.country,
    );
    if (
      deck.bytes !== length ||
      deck.rows < 100_000 ||
      deck.countries.length < 190 ||
      deck.buckets.size === 0
    )
      invalid();
    // Reject a provider-generated subset even if the subset has a valid HTTP
    // length. Losing previously covered countries or most of the deck deserves
    // inspection; its predecessor stays active for every existing quote.
    const previous = await db
      .prepare(
        `SELECT r.evidence_json FROM worldwide_fax_catalog_state s
      JOIN worldwide_fax_catalog_revisions r ON r.scope=s.scope AND r.id=s.revision WHERE s.scope=?`,
      )
      .bind(scope)
      .first<string>("evidence_json");
    if (previous) {
      const prior = JSON.parse(previous) as CatalogEvidence;
      const destinations = new Set(deck.countries);
      if (
        deck.rows < prior.rows * 0.75 ||
        prior.countries.some((country) => !destinations.has(country))
      )
        invalid();
    }
    const currency = parseFaxFx(fx.text, stamp()),
      pageNanoUsd = parseFaxPagePrice(page.text);
    const evidence: CatalogEvidence = {
      senderCountry: number.country,
      sourceReference: discovery.rateDeckUrl,
      sourceSha256: "",
      discoverySha256: discovery.sha256,
      deckSha256: deck.sha256,
      pageSha256: page.sha256,
      fxSha256: fx.sha256,
      rows: deck.rows,
      bytes: deck.bytes,
      countries: deck.countries,
      pageNanoUsd,
      fxNumerator: currency.numerator,
      fxDenominator: currency.denominator,
      fxDate: currency.date,
      fxSource: currency.source,
    };
    evidence.sourceSha256 = fingerprint(JSON.stringify({ ...evidence, scope }));
    // The compiled index depends on the sender and country as well as the CSV.
    const compiledKey = fingerprint(
      JSON.stringify([deck.sha256, number.country]),
    );
    let deckId = await db
      .prepare(
        "SELECT id FROM worldwide_fax_catalog_decks WHERE scope=? AND deck_sha256=? AND complete=1 LIMIT 1",
      )
      .bind(scope, compiledKey)
      .first<string>("id");
    if (!deckId) {
      deckId = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO worldwide_fax_catalog_decks(id,scope,deck_sha256,created_at) VALUES(?,?,?,?)",
        )
        .bind(deckId, scope, compiledKey, stamp())
        .run();
      // Bind compact groups in one set-based INSERT per batch. One SQL query
      // per prefix bucket would exceed the scheduled Worker's D1 query budget.
      let group: [string, string][] = [],
        bytes = 0;
      const flush = async () => {
        await db
          .prepare(
            `INSERT INTO worldwide_fax_catalog_buckets(deck_id,bucket,routes)
          SELECT ?,json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)`,
          )
          .bind(deckId, JSON.stringify(group))
          .run();
        group = [];
        bytes = 0;
      };
      for (const [bucket, records] of deck.buckets) {
        abort.signal.throwIfAborted();
        const routes = records.join("\n");
        if (routes.length > 1_000_000) invalid();
        if (group.length && bytes + routes.length > 384_000) await flush();
        group.push([bucket, routes]);
        bytes += routes.length + records.length + 16;
      }
      if (group.length) await flush();
      await db
        .prepare(
          `UPDATE worldwide_fax_catalog_decks SET complete=1 WHERE id=? AND scope=? AND (SELECT count(*) FROM worldwide_fax_catalog_buckets WHERE deck_id=?)=?`,
        )
        .bind(deckId, scope, deckId, deck.buckets.size)
        .run();
    }
    abort.signal.throwIfAborted();
    const revision = crypto.randomUUID(),
      finished = stamp();
    const committed = await db.batch([
      db
        .prepare(
          `INSERT INTO worldwide_fax_catalog_revisions(id,deck_id,scope,evidence_json,created_at) SELECT ?,d.id,d.scope,?,? FROM worldwide_fax_catalog_decks d JOIN worldwide_fax_catalog_state s ON s.scope=d.scope
        WHERE d.id=? AND d.scope=? AND d.complete=1 AND s.lease_token=? AND s.lease_until>?`,
        )
        .bind(
          revision,
          JSON.stringify(evidence),
          finished,
          deckId,
          scope,
          lease,
          finished,
        ),
      db
        .prepare(
          `UPDATE worldwide_fax_catalog_state SET revision=?,last_failure_at=NULL,next_due_at=?,lease_token=NULL,lease_until=NULL WHERE scope=? AND lease_token=? AND EXISTS(SELECT 1 FROM worldwide_fax_catalog_revisions WHERE scope=? AND id=?)`,
        )
        .bind(revision, later(20 * 3_600_000), scope, lease, scope, revision),
    ]);
    if (!committed[1].meta.changes) invalid();
    counts.worldwideFaxCatalogRefreshed = 1;
    const cutoff = later(-7 * DAY);
    await db.batch([
      db
        .prepare(
          "DELETE FROM worldwide_fax_catalog_revisions WHERE scope=? AND created_at<? AND id<>(SELECT revision FROM worldwide_fax_catalog_state WHERE scope=?)",
        )
        .bind(scope, cutoff, scope),
      db
        .prepare(
          "DELETE FROM worldwide_fax_catalog_decks WHERE scope=? AND created_at<? AND NOT EXISTS(SELECT 1 FROM worldwide_fax_catalog_revisions r WHERE r.deck_id=worldwide_fax_catalog_decks.id)",
        )
        .bind(scope, cutoff),
    ]);
  } catch {
    counts.worldwideFaxCatalogFailed = 1;
    await db
      .prepare(
        "UPDATE worldwide_fax_catalog_state SET last_failure_at=?,next_due_at=?,lease_token=NULL,lease_until=NULL WHERE scope=? AND lease_token=?",
      )
      .bind(stamp(), later(3_600_000), scope, lease)
      .run();
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
  return counts;
}
