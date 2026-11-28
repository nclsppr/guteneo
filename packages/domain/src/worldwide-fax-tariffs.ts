import { canonicalJson, DomainError, sha256 } from "./index";
import type { FaxUsageTariff } from "./live-fax-usage";
import type { LiveFaxIdentity } from "./live-fax-quotes";
import {
  resolveWorldwideFaxReference,
  worldwideFaxScope,
} from "./worldwide-fax-catalog";
import { FAX_E164 } from "../../contracts/src/fax-number";

export const FAX_CONTINUITY_REFERENCE = "worldwide-fax:guteneo_continuity_v1";

export async function resolveWorldwideFaxTariff(
  db: D1Database,
  organizationId: string,
  senderId: string,
  destinationNumber: string,
  options: string,
  identity: LiveFaxIdentity,
  now: string,
): Promise<FaxUsageTariff> {
  const profile = identity.outboundProfileId;
  if (
    options !== "{}" ||
    !profile ||
    !/^[a-zA-Z0-9_.:-]{1,200}$/.test(profile) ||
    !FAX_E164.test(destinationNumber)
  ) {
    throw new DomainError(
      "FAX_CONFIGURATION_INVALID",
      "The fax number, sending profile or options are invalid.",
      409,
    );
  }
  const sender = await db
    .prepare(
      "SELECT s.address FROM senders s JOIN organizations o ON o.id=s.organization_id WHERE s.organization_id=? AND s.id=? AND s.channel='fax' AND s.mode='production' AND s.status='verified' AND o.mode='production'",
    )
    .bind(organizationId, senderId)
    .first<string>("address");
  if (!sender || !FAX_E164.test(sender))
    throw new DomainError(
      "SENDER_REQUIRED",
      "A verified fax sender is required.",
      409,
    );

  const scope = [
    organizationId,
    senderId,
    identity.accountId,
    identity.connectionId,
    profile,
    options,
  ];
  const binding = {
    accountId: identity.accountId,
    connectionId: identity.connectionId,
    outboundProfileId: profile,
    senderNumber: sender,
  };
  const catalog = await resolveWorldwideFaxReference(db, {
    ...binding,
    destinationNumber,
  }).catch(() => null);
  // An active deck can deliberately leave this number ambiguous or unmatched.
  // Only a positively absent deck permits reuse of the pre-catalogue policy.
  const activeDeck =
    !catalog &&
    (await db
      .prepare(
        "SELECT revision FROM worldwide_fax_catalog_state WHERE scope=? AND revision IS NOT NULL",
      )
      .bind(worldwideFaxScope(binding))
      .first()
      .catch(() => null));
  // Examine all matching prefixes, including denials and revoked rows. An
  // unpriced more-specific category cannot inherit a cheaper parent price.
  const prior =
    !catalog && !activeDeck
      ? await db
          .prepare(
            `SELECT t.* FROM trusted_fax_usage_tariffs t
    WHERE organization_id=? AND sender_id=? AND account_id=? AND connection_id=? AND outbound_profile_id=? AND options_json=?
    AND execution_scope='live' AND substr(?,1,length(sender_prefix))=sender_prefix
    AND substr(?,1,length(destination_prefix))=destination_prefix AND valid_from<=?
    AND source_reference<>?
    AND (route_qualification<>'worldwide' OR EXISTS(
      SELECT 1 FROM live_fax_quotes_v3 q JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id
      WHERE q.organization_id=t.organization_id AND q.tariff_id=t.id AND json_extract(d.recipient_json,'$.phone')=?))
    ORDER BY length(destination_prefix) DESC,(status='qualified') DESC,created_at DESC,id DESC LIMIT 1`,
          )
          .bind(
            ...scope,
            sender,
            destinationNumber,
            now,
            FAX_CONTINUITY_REFERENCE,
            destinationNumber,
          )
          .first<FaxUsageTariff>()
      : null;
  const historical =
    prior?.status === "qualified" && prior.route_allowed === 1 ? prior : null;
  const basis = catalog
    ? catalog.lastKnown
      ? "last_known_reference"
      : "worldwide_catalog"
    : historical
      ? "last_known_reference"
      : "guteneo_continuity_v1";
  // The published EUR estimate is independent of supplier cost. This archived
  // commercial FX is used solely to convert later, separately verified USD usage.
  const rates = {
    sender_prefix: sender,
    sender_country_code:
      catalog?.senderCountry ?? historical?.sender_country_code ?? "ZZ",
    destination_prefix:
      catalog?.destinationPrefix ??
      historical?.destination_prefix ??
      destinationNumber.slice(0, 2),
    destination_country_code:
      catalog?.destinationCountry ??
      historical?.destination_country_code ??
      "ZZ",
    minute_nano_usd: catalog?.minuteNanoUsd ?? historical?.minute_nano_usd ?? 0,
    page_nano_usd: catalog?.pageNanoUsd ?? historical?.page_nano_usd ?? 0,
    call_nano_usd: catalog?.callNanoUsd ?? historical?.call_nano_usd ?? 0,
    initial_seconds:
      catalog?.initialSeconds ?? historical?.initial_seconds ?? 60,
    increment_seconds:
      catalog?.incrementSeconds ?? historical?.increment_seconds ?? 60,
    duration_base_seconds: historical?.duration_base_seconds ?? 30,
    duration_low_per_page_seconds:
      historical?.duration_low_per_page_seconds ?? 60,
    duration_high_per_page_seconds:
      historical?.duration_high_per_page_seconds ?? 180,
    fx_numerator: catalog?.fxNumerator ?? historical?.fx_numerator ?? 10000,
    fx_denominator:
      catalog?.fxDenominator ?? historical?.fx_denominator ?? 11537,
    fx_date: catalog?.fxDate ?? historical?.fx_date ?? "2026-09-16",
    fx_source:
      catalog?.fxSource ??
      historical?.fx_source ??
      "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
  };
  if (
    historical?.source_reference.startsWith(
      "worldwide-fax:last_known_reference:",
    ) &&
    !catalog
  )
    return historical;
  const sourceReference =
    basis === "guteneo_continuity_v1"
      ? FAX_CONTINUITY_REFERENCE
      : `worldwide-fax:${basis}:${catalog?.sourceSha256 ?? historical!.source_sha256}`;
  const sourceHash = await sha256(
    canonicalJson({
      basis,
      sourceReference,
      source:
        catalog?.sourceReference ??
        historical?.source_reference ??
        FAX_CONTINUITY_REFERENCE,
      rates,
    }),
  );
  const key = `fax_world_${await sha256(canonicalJson({ scope, sourceHash }))}`;
  const tariff: FaxUsageTariff = {
    id: key,
    organization_id: organizationId,
    sender_id: senderId,
    provider: "telnyx",
    account_id: identity.accountId,
    connection_id: identity.connectionId,
    outbound_profile_id: profile,
    ...rates,
    origin_class: "worldwide",
    destination_category: "worldwide",
    route_allowed: 1,
    local_calling_verified: 0,
    route_qualification: "worldwide",
    execution_scope: "live",
    options_json: options,
    currency: "USD",
    max_pages: 350,
    quote_ttl_seconds: 900,
    source_reference: sourceReference,
    source_sha256: sourceHash,
    valid_from: catalog?.observedAt ?? historical?.valid_from ?? now,
    expires_at: "9999-12-31T23:59:59.999Z",
    status: "qualified",
    created_at: now,
  };
  const columns = Object.keys(tariff) as (keyof FaxUsageTariff)[];
  await db
    .prepare(
      `INSERT INTO trusted_fax_usage_tariffs(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")}
    WHERE NOT EXISTS(SELECT 1 FROM fax_review_preparation_authorities WHERE organization_id=?)
    ON CONFLICT(organization_id,id) DO NOTHING`,
    )
    .bind(...columns.map((key) => tariff[key]), organizationId)
    .run();
  const stored = await db
    .prepare(
      "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=? AND status='qualified'",
    )
    .bind(organizationId, key)
    .first<FaxUsageTariff>();
  if (!stored)
    throw new DomainError(
      "FAX_ROUTE_UNAVAILABLE",
      "This fax route is unavailable.",
      409,
    );
  return stored;
}
