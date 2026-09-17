import {
  DomainService,
  type ActorContext,
} from "../../packages/domain/src/index";
import type { FaxUsageTariff } from "../../packages/domain/src/live-fax-usage";

export async function insertRecord(
  db: D1Database,
  table: string,
  value: Record<string, unknown>,
) {
  const columns = Object.keys(value);
  await db
    .prepare(
      `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
    )
    .bind(...columns.map((c) => value[c]))
    .run();
}
export function fixtureTariff(now: string, org = "fixture"): FaxUsageTariff {
  return {
    id: `tariff_${org}`,
    organization_id: org,
    sender_id: `sender_${org}`,
    provider: "telnyx",
    account_id: "fixture-account",
    connection_id: "fixture-application",
    outbound_profile_id: "fixture-profile",
    sender_prefix: "+352",
    destination_prefix: "+33",
    sender_country_code: "LU",
    destination_country_code: "FR",
    origin_class: "eea",
    destination_category: "fixed",
    route_allowed: 1,
    local_calling_verified: 0,
    options_json: "{}",
    currency: "USD",
    page_nano_usd: 7_000_000,
    minute_nano_usd: 5_600_000,
    call_nano_usd: 0,
    initial_seconds: 60,
    increment_seconds: 60,
    duration_base_seconds: 0,
    duration_low_per_page_seconds: 30,
    duration_high_per_page_seconds: 90,
    fx_numerator: 9,
    fx_denominator: 10,
    fx_date: now.slice(0, 10),
    fx_source: "ISOLATED SYNTHETIC FX",
    max_pages: 10,
    quote_ttl_seconds: 300,
    source_reference: "ISOLATED SYNTHETIC RATE - NEVER PRODUCTION",
    source_sha256: "b".repeat(64),
    valid_from: now,
    expires_at: new Date(Date.parse(now) + 3600_000).toISOString(),
    status: "qualified",
    created_at: now,
  };
}
export async function createFaxUsageFixture(
  db: D1Database,
  clock: () => number,
  overrides: Partial<FaxUsageTariff> = {},
) {
  const org = `fixture_${crypto.randomUUID()}`,
    now = new Date(clock()).toISOString();
  const ctx: ActorContext = {
    organizationId: org,
    userId: `user_${org}`,
    role: "admin",
    actor: "browser",
  };
  const tariff = { ...fixtureTariff(now, org), ...overrides };
  const identity = {
    accountId: tariff.account_id,
    connectionId: tariff.connection_id,
    outboundProfileId: tariff.outbound_profile_id,
  };
  await db
    .prepare("INSERT INTO organizations VALUES(?,'Fixture','production',?)")
    .bind(org, now)
    .run();
  await db
    .prepare(
      "INSERT INTO users VALUES(?,'Fixture','fixture@example.invalid',?)",
    )
    .bind(ctx.userId, now)
    .run();
  await db
    .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
    .bind(org, ctx.userId, now)
    .run();
  await db
    .prepare(
      "INSERT INTO senders VALUES(?,?,'fax','Fixture','+35220000000','verified','production',?)",
    )
    .bind(tariff.sender_id, org, now)
    .run();
  await db
    .prepare("INSERT INTO channel_controls VALUES(?,'fax',1)")
    .bind(org)
    .run();
  await db
    .prepare(
      "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'fax',?,100,5000,'EUR')",
    )
    .bind(org, now.slice(0, 7))
    .run();
  const domain = new DomainService(db, {
    mode: "production",
    now: clock,
    liveFaxIdentity: identity,
  });
  const documentId = `doc_${org}`;
  await domain.registerDocument(ctx, {
    id: documentId,
    name: "synthetic.pdf",
    sha256: "a".repeat(64),
    size: 100,
    pages: 2,
    status: "ready",
    source: "import",
    storageKey: `fixture/${documentId}.pdf`,
    scanVerified: true,
  });
  await insertRecord(db, "trusted_fax_usage_tariffs", tariff);
  const input = {
    channel: "fax" as const,
    documentId,
    recipient: { phone: "+33100000001" },
    ceilingMinor: 100,
  };
  return { ctx, tariff, identity, domain, input, documentId };
}
