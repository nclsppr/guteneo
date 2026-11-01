import { expect, vi } from "vitest";
import { canonicalJson, sha256 } from "../../packages/domain/src/index";
import type { Env } from "../../apps/api/src/env";
import { telnyxAccountReference } from "../../packages/providers/telnyx-readiness";
import { createFaxUsageFixture, insertRecord } from "./fax-usage-fixture";

export const VERIFIED_FAX_PREFIXES = [
  "+331",
  "+332",
  "+333",
  "+334",
  "+335",
  "+339",
  "+492",
  "+493",
  "+494",
  "+495",
  "+496",
  "+497",
  "+498",
  "+499",
] as const;
export const VERIFIED_FAX_EXCLUSIONS = [
  "+33182883934",
  "+4932",
  "+49700",
  "+49800",
] as const;
export type ReferenceRow = Record<string, string | number | null>;
export const VERIFIED_DECK_URL =
  "https://portal.telnyx.com/downloads/global_conversational/isolated_verified_fixture.csv";
export const VERIFIED_CSV_HEADER =
  "ISO,Country,Origination Prefixes,Destination Prefixes,Description,Interval 1,Interval N,Rate,Price Per Call,Exact Match";
const origins =
  "30,31,32,33,34,351,352,353,354,356,357,358,359,36,370,371,372,385,386,39,40,420,421,423,43,45,46,47,48,49";

export async function verifiedBindingHash(
  organizationId: string,
  tariffId: string,
) {
  return sha256(
    canonicalJson({
      organizationId,
      family: "fax_tariff",
      mechanism: "manual_fax:" + tariffId,
    }),
  );
}

export async function mapVerifiedTariff(
  db: D1Database,
  organizationId: string,
  setId: string,
  tariffId: string,
  bindingSha256?: string,
) {
  await insertRecord(db, "verified_fax_reference_tariffs", {
    organization_id: organizationId,
    set_id: setId,
    tariff_id: tariffId,
    binding_sha256:
      bindingSha256 ?? (await verifiedBindingHash(organizationId, tariffId)),
  });
}

export async function createVerifiedFaxReferenceFixture(
  db: D1Database,
  now: () => number,
  options: { current?: boolean } = {},
) {
  const stamp = new Date(now()).toISOString();
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  const account = (await telnyxAccountReference(publicKey))!;
  const fixture = await createFaxUsageFixture(db, now, {
    account_id: account,
    connection_id: "123",
    outbound_profile_id: "456",
    valid_from: options.current
      ? new Date(now() - 86400000).toISOString()
      : "2026-09-17T09:00:00.000Z",
    expires_at: options.current
      ? new Date(now() + 5 * 86400000).toISOString()
      : "2026-09-24T09:00:00.000Z",
    fx_date: options.current
      ? new Date(now() - 86400000).toISOString().slice(0, 10)
      : "2026-09-17",
  });
  await db
    .prepare("UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE id=?")
    .bind(fixture.tariff.id)
    .run();
  for (const [index, prefix] of [
    ...VERIFIED_FAX_PREFIXES,
    ...VERIFIED_FAX_EXCLUSIONS,
  ].entries()) {
    await insertRecord(db, "trusted_fax_usage_tariffs", {
      ...fixture.tariff,
      id: "reference_" + crypto.randomUUID(),
      destination_prefix: prefix,
      destination_country_code: prefix.startsWith("+33") ? "FR" : "DE",
      destination_category: index <= 14 ? "fixed" : "special",
      route_allowed: index < 14 ? 1 : 0,
      route_qualification: "provider_verified",
      operator_authorization_reference: null,
      operator_test_ceiling_minor: null,
      execution_scope: "live",
      review_authority_id: null,
      evidence_observed_at: null,
    });
  }
  const selected = await db
    .prepare(
      "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND status='qualified' ORDER BY destination_prefix",
    )
    .bind(fixture.ctx.organizationId)
    .all<ReferenceRow>();
  const bindings = selected.results.filter((row) => row.route_allowed === 1);
  const exclusions = selected.results.filter((row) => row.route_allowed === 0);
  const sourceId = "verified_set_" + crypto.randomUUID();
  const set = {
    organization_id: fixture.ctx.organizationId,
    id: sourceId,
    sender_id: fixture.tariff.sender_id,
    sender_address_sha256: await sha256("+35220000000"),
    account_id: account,
    connection_id: "123",
    outbound_profile_id: "456",
    options_json: "{}",
    bindings_json: canonicalJson(bindings),
    exclusions_json: canonicalJson(exclusions),
    commercial_basis: "public_reference_not_negotiated",
    status: "active",
    created_at: stamp,
  };
  const env = {
    DB: db,
    MODE: "production",
    ENVIRONMENT: "production",
    APP_ORIGIN: "https://guteneo.com",
    LIVE_SENDS_ENABLED: "true",
    LIVE_SEND_CHANNELS: "fax",
    TELNYX_API_KEY: "isolated-verified-reference-key",
    TELNYX_PUBLIC_KEY: publicKey,
    TELNYX_ACCOUNT_ID: account,
    TELNYX_CONNECTION_ID: "123",
    TELNYX_OUTBOUND_VOICE_PROFILE_ID: "456",
    TELNYX_FROM: "+35220000000",
    TELNYX_ALLOWED_PREFIXES: "+33,+49,+352",
    EMAIL_PROVIDER: "ses",
  } as Env;
  return { db, env, fixture, sourceId, set, bindings, exclusions };
}

export type VerifiedFaxReferenceFixture = Awaited<
  ReturnType<typeof createVerifiedFaxReferenceFixture>
>;

export async function registerVerifiedFaxFixture(
  value: VerifiedFaxReferenceFixture,
) {
  await insertRecord(value.db, "verified_fax_reference_sets", value.set);
  expect(
    await value.db
      .prepare(
        "SELECT id FROM valid_verified_fax_reference_sets WHERE organization_id=? AND id=?",
      )
      .bind(value.fixture.ctx.organizationId, value.sourceId)
      .all(),
  ).toMatchObject({ results: [{ id: value.sourceId }] });
  for (const row of value.bindings)
    await mapVerifiedTariff(
      value.db,
      value.fixture.ctx.organizationId,
      value.sourceId,
      String(row.id),
    );
}

export function verifiedFaxCsv() {
  const rows = [...VERIFIED_FAX_PREFIXES, ...VERIFIED_FAX_EXCLUSIONS].map(
    (prefix) => {
      const country = prefix.startsWith("+33") ? "France" : "Germany";
      const iso = prefix.startsWith("+33") ? "FR" : "DE";
      return `${iso},${country},"${origins}",${prefix.slice(1)},Trunking Outbound Minute - ${country} - From EEA,60,60,0.010000001,,`;
    },
  );
  return [VERIFIED_CSV_HEADER, ...rows].join("\n") + "\n";
}

export function verifiedFaxNetwork(
  now: () => number,
  options: {
    before?: (url: string) => Promise<void>;
    csv?: string;
    pageStatus?: number;
    deckUrl?: string;
    whitelist?: string[];
  } = {},
) {
  const deckUrl = options.deckUrl ?? VERIFIED_DECK_URL;
  return vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = String(input);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init.headers);
    if (url.startsWith("https://api.telnyx.com/v2/"))
      expect(headers.get("authorization")).toBe(
        "Bearer isolated-verified-reference-key",
      );
    else {
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("cookie")).toBe(false);
    }
    await options.before?.(url);
    if (url === "https://api.telnyx.com/v2/tariffs")
      return Response.json({
        data: { global_conversational: { tariff_link: deckUrl } },
      });
    if (url === deckUrl) return new Response(options.csv ?? verifiedFaxCsv());
    if (url === "https://telnyx.com/pricing/fax")
      return new Response(
        "<p>Send a fax via API $0.009 per page + SIP Trunking usage for transmission</p>",
        { status: options.pageStatus ?? 200 },
      );
    if (url === "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml")
      return new Response(
        `<Cube time='${new Date(now()).toISOString().slice(0, 10)}'><Cube currency='USD' rate='2.000000'/></Cube>`,
      );
    if (url === "https://api.telnyx.com/v2/fax_applications/123")
      return Response.json({
        data: {
          id: "123",
          active: true,
          outbound: { outbound_voice_profile_id: "456", channel_limit: 1 },
        },
      });
    if (url.startsWith("https://api.telnyx.com/v2/phone_numbers?"))
      return Response.json({
        data: [
          {
            id: "789",
            connection_id: "123",
            phone_number: "+35220000000",
            country_iso_alpha2: "LU",
            status: "active",
            t38_fax_gateway_enabled: true,
          },
        ],
        meta: { page_number: 1, total_pages: 1 },
      });
    if (url === "https://api.telnyx.com/v2/outbound_voice_profiles/456")
      return Response.json({
        data: {
          id: "456",
          enabled: true,
          whitelisted_destinations: options.whitelist ?? ["FR", "DE", "LU"],
          concurrent_call_limit: 1,
          max_destination_rate: null,
          daily_spend_limit: null,
          daily_spend_limit_enabled: false,
        },
      });
    throw new Error("Unexpected isolated provider request");
  });
}
