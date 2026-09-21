import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { canonicalJson, sha256 } from "../../packages/domain/src/index";
import {
  postalPolicyOptions,
  postalRateEvidence,
  resolveDeliveryPrice,
} from "../../packages/domain/src/live-delivery-quotes";

import { hashSecret } from "../../apps/api/src/auth";
import { handlePostalSetupRoute } from "../../apps/api/src/postal-setup";
import type { Env } from "../../apps/api/src/env";

let mf: Miniflare;
let db: D1Database;
const migrationName = "0036_postal_window_options.sql";
const now = new Date().toISOString();
const created = new Date(Date.now() - 20 * 86400000).toISOString();
const expiry = new Date(Date.now() + 70 * 86400000).toISOString();
const expired = new Date(Date.now() - 86400000).toISOString();
const sourceReference = "https://api.pingen.com/documentation/swagger-docs";

async function apply(name: string) {
  const sql = await readFile(
    new URL(`../../migrations/${name}`, import.meta.url),
    "utf8",
  );
  await db.batch(
    unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)),
  );
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "postal-window-migration",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql") && name < migrationName)
    .sort())
    await apply(name);
});
afterAll(async () => {
  await mf?.dispose();
});

async function seed(
  id: string,
  country = "LU",
  isExpired = false,
  revoked = false,
  conflict = false,
) {
  const position = country === "FR" ? "right" : "left";
  const profile = canonicalJson({
    accountId: "postal_account",
    billingCurrency: "EUR",
    defaultCountry: country,
    addressPosition: position,
  });
  const rate = canonicalJson(postalRateEvidence(created.slice(0, 10)));
  const sourceHash = await sha256(
    canonicalJson({ rate: JSON.parse(rate), profile: JSON.parse(profile) }),
  );
  const expires = isExpired ? expired : expiry;
  const ids = postalPolicyOptions(position).map(
    (_, index) => `${id}_cost_${index}`,
  );
  const statements = [
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,'production',?)",
      )
      .bind(id, "Migration fixture", created),
    db
      .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)")
      .bind(`${id}_user`, "Fixture", `${id}@example.invalid`, created),
    db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'postal','Fixture','Fixture address','verified','production',?)",
      )
      .bind(`${id}_sender`, id, created),
    db
      .prepare("INSERT INTO channel_controls VALUES(?,'postal',?)")
      .bind(id, id === "stopped" ? 0 : 1),
    db
      .prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,'postal.sender.declared',?,'{}',?)",
      )
      .bind(`${id}_audit`, id, `${id}_user`, `${id}_sender`, created),
    db
      .prepare(
        "INSERT INTO postal_sender_declarations(organization_id,sender_id,user_id,sender_name,sender_address,authorization_basis,physical_address_verified,profile_json,audit_id,created_at) VALUES(?,?,?,'Fixture','Fixture address','authenticated_administrator_declaration',0,?,?,?)",
      )
      .bind(id, `${id}_sender`, `${id}_user`, profile, `${id}_audit`, created),
  ];
  for (const [index, options] of postalPolicyOptions(position).entries()) {
    statements.push(
      db
        .prepare(
          "INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at,pricing_basis) VALUES(?,?,?,'postal','pingen','postal_account','postal_account',?,?,0,0,1,'EUR','qualified_final_variable_cost',300,?,?,?,?,?,?,'public_list_price_ex_tax')",
        )
        .bind(
          ids[index],
          id,
          `${id}_sender`,
          canonicalJson(options),
          rate,
          sourceReference,
          sourceHash,
          created,
          expires,
          revoked && index === 0 ? "revoked" : "qualified",
          created,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        "INSERT INTO postal_setup_policy_generations VALUES(?,1,?,?,?,?,?,?)",
      )
      .bind(
        id,
        `${id}_sender`,
        canonicalJson(ids),
        profile,
        `${id}_audit`,
        created,
        expires,
      ),
  );
  await db.batch(statements);
  if (conflict)
    await db
      .prepare(
        "INSERT INTO trusted_delivery_costs SELECT 'manual_opposite',organization_id,sender_id,channel,provider,account_id,route_id,json_set(options_json,'$.addressPosition','right'),rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,'revoked',created_at,pricing_basis FROM trusted_delivery_costs WHERE id=?",
      )
      .bind(ids[0])
      .run();
}

it("extends active non-French qualifications without changing history, expiry, revocations, stops or grants", async () => {
  await seed("active");
  await seed("expired", "LU", true);
  await seed("expired_revoked", "LU", true, true);
  await seed("revoked", "DE", false, true);
  await seed("french", "FR");
  await seed("manual", "LU", false, false, true);
  await seed("stopped");
  const oldPolicies = (
    await db.prepare("SELECT * FROM trusted_delivery_costs ORDER BY id").all()
  ).results;
  const oldGenerations = (
    await db
      .prepare(
        "SELECT * FROM postal_setup_policy_generations ORDER BY organization_id",
      )
      .all()
  ).results;
  const declarations = (
    await db
      .prepare(
        "SELECT * FROM postal_sender_declarations ORDER BY organization_id",
      )
      .all()
  ).results;
  const channels = (
    await db
      .prepare("SELECT * FROM channel_controls ORDER BY organization_id")
      .all()
  ).results;
  const grants = (
    await db
      .prepare("SELECT * FROM welcome_credit_grants ORDER BY organization_id")
      .all()
  ).results;
  await apply(migrationName);
  for (const policy of oldPolicies)
    expect(
      await db
        .prepare("SELECT * FROM trusted_delivery_costs WHERE id=?")
        .bind(policy.id)
        .first(),
    ).toEqual(policy);
  for (const generation of oldGenerations)
    expect(
      await db
        .prepare(
          "SELECT * FROM postal_setup_policy_generations WHERE organization_id=? AND generation=1",
        )
        .bind(generation.organization_id)
        .first(),
    ).toEqual(generation);
  for (const id of ["active", "revoked", "stopped"]) {
    const rows = (
      await db
        .prepare(
          "SELECT * FROM trusted_delivery_costs WHERE organization_id=? ORDER BY id",
        )
        .bind(id)
        .all()
    ).results;
    expect(rows).toHaveLength(16);
    for (const mirror of rows.filter((row) =>
      String(row.id).startsWith("cost_window_"),
    )) {
      const original = rows.find(
        (row) => `cost_window_${row.id}` === mirror.id,
      )!;
      expect(mirror).toEqual({
        ...original,
        id: mirror.id,
        options_json: canonicalJson({
          ...JSON.parse(String(original.options_json)),
          addressPosition: "right",
        }),
      });
    }
    const generation = await db
      .prepare(
        "SELECT * FROM postal_setup_policy_generations WHERE organization_id=? AND generation=2",
      )
      .bind(id)
      .first();
    expect(generation?.expires_at).toBe(expiry);
    expect(String(generation?.created_at) >= now).toBe(true);
    expect(JSON.parse(String(generation?.policy_ids_json))).toHaveLength(16);
    const audit = await db
      .prepare(
        "SELECT user_id,details_json FROM audit_log WHERE organization_id=? AND action='postal.pricing.windows_extended'",
      )
      .bind(id)
      .first();
    expect(audit?.user_id).toBeNull();
    expect(JSON.parse(String(audit?.details_json))).toMatchObject({
      humanConsentClaimed: false,
      priceDatesExtended: false,
    });
  }
  for (const [id, count] of [
    ["expired", 8],
    ["expired_revoked", 8],
    ["french", 8],
    ["manual", 9],
  ] as const) {
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM trusted_delivery_costs WHERE organization_id=?",
        )
        .bind(id)
        .first<number>("n"),
    ).toBe(count);
    expect(
      await db
        .prepare(
          "SELECT MAX(generation) n FROM postal_setup_policy_generations WHERE organization_id=?",
        )
        .bind(id)
        .first<number>("n"),
    ).toBe(1);
  }
  expect(
    (
      await db
        .prepare(
          "SELECT * FROM postal_sender_declarations ORDER BY organization_id",
        )
        .all()
    ).results,
  ).toEqual(declarations);
  expect(
    (
      await db
        .prepare("SELECT * FROM channel_controls ORDER BY organization_id")
        .all()
    ).results,
  ).toEqual(channels);
  expect(
    (
      await db
        .prepare("SELECT * FROM welcome_credit_grants ORDER BY organization_id")
        .all()
    ).results,
  ).toEqual(grants);
  const makePrice = (
    organizationId: string,
    addressPosition: "left" | "right",
  ) =>
    resolveDeliveryPrice(db, {
      organizationId,
      senderId: `${organizationId}_sender`,
      channel: "postal",
      recipient: { country: "LU" },
      options: {
        ...postalPolicyOptions(addressPosition)[0],
        providerDraftId: "draft",
        preparedLetterId: "letter",
      },
      document: { id: "document", sha256: "a".repeat(64), size: 1000 },
      identity: { accountId: "postal_account", routeId: "postal_account" },
      now: new Date().toISOString(),
      postalQuote: async () => ({
        supplierMinor: 100,
        currency: "EUR",
        providerDraftId: "draft",
        preparedLetterId: "letter",
        evidenceSha256: "e".repeat(64),
      }),
    });
  for (const side of ["left", "right"] as const) {
    const price = await makePrice("active", side);
    expect(JSON.parse(price.policy.options_json).addressPosition).toBe(side);
    await expect(makePrice("expired", side)).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
    await expect(makePrice("revoked", side)).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
  }
  await verifyHistoricalRenewal();
  await expect(
    db
      .prepare(
        "UPDATE postal_setup_policy_generations SET expires_at=? WHERE organization_id='active'",
      )
      .bind(new Date(Date.now() + 90 * 86400000).toISOString())
      .run(),
  ).rejects.toThrow("immutable_postal_setup_policy_generation");
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
    [],
  );
  expect(
    await db.prepare("PRAGMA quick_check").first<string>("quick_check"),
  ).toBe("ok");
});

async function verifyHistoricalRenewal() {
  const env: Env = {
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example",
    AUTH0_AUTH_POLICY: "verified_email",
    LIVE_SENDS_ENABLED: "true",
    LIVE_SEND_CHANNELS: "postal",
    POSTAL_DRAFTS_ENABLED: "true",
    PINGEN_SANDBOX: "false",
    PINGEN_CLIENT_ID: "fixture-client",
    PINGEN_CLIENT_SECRET: "fixture-secret",
    PINGEN_ORGANIZATION_ID: "postal_account",
    PINGEN_DEFAULT_COUNTRY: "LU",
    PINGEN_WEBHOOK_SECRET: "fixture-webhook",
    PINGEN_UPLOAD_ORIGINS: "https://upload.pingen.example",
    DOCUMENTS: {} as R2Bucket,
    DISPATCH_QUEUE: {} as Queue<{ dispatchId: string }>,
    BULK_QUEUE: {} as Queue<{ dispatchId: string }>,
    ASSETS: {} as Env["ASSETS"],
  };
  for (const org of ["expired", "expired_revoked"]) {
    const secret = `${org}_`.padEnd(43, "s");
    await db.batch([
      db
        .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
        .bind(org, `${org}_user`, now),
      db
        .prepare(
          "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,'fixture-csrf',0,0,?,?,1)",
        )
        .bind(
          await hashSecret(secret),
          `${org}_user`,
          org,
          now,
          new Date(Date.now() + 3600000).toISOString(),
        ),
    ]);
    const request = (method: "GET" | "POST") =>
      new Request(`${env.APP_ORIGIN}/api/postal/setup`, {
        method,
        headers: {
          Cookie: `__Host-guteneo_session=${secret}`,
          Origin: env.APP_ORIGIN,
          "X-CSRF-Token": "fixture-csrf",
          "Content-Type": "application/json",
        },
        ...(method === "POST"
          ? {
              body: JSON.stringify({
                name: "Fixture",
                address: "Fixture address",
                authorized: true,
              }),
            }
          : {}),
      });
    const read = await handlePostalSetupRoute(request("GET"), env);
    expect(await read!.json()).toMatchObject({
      configured: false,
      reason:
        org === "expired" ? "pricing_expired" : "operator_review_required",
    });
    const options = {
      fetcher: async (url: string | URL | Request) => {
        const path = new URL(String(url)).pathname;
        if (path === "/auth/access-tokens")
          return Response.json({
            access_token: "fixture",
            token_type: "Bearer",
            expires_in: 3600,
          });
        if (path === "/organisations/postal_account")
          return Response.json({
            data: {
              id: "postal_account",
              type: "organisations",
              attributes: {
                billing_currency: "EUR",
                default_country: "LU",
                default_address_position: "left",
              },
            },
          });
        throw new Error("No provider transfer permitted");
      },
    };
    if (org === "expired_revoked") {
      await expect(
        handlePostalSetupRoute(request("POST"), env, options),
      ).rejects.toMatchObject({ code: "POSTAL_SETUP_REVIEW_REQUIRED" });
    } else {
      const response = await handlePostalSetupRoute(
        request("POST"),
        env,
        options,
      );
      expect(await response!.json()).toMatchObject({ configured: true });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) n FROM trusted_delivery_costs WHERE organization_id=? AND status='qualified'",
          )
          .bind(org)
          .first<number>("n"),
      ).toBe(16);
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) n FROM trusted_delivery_costs WHERE organization_id=? AND status='revoked'",
          )
          .bind(org)
          .first<number>("n"),
      ).toBe(8);
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) n FROM postal_sender_declarations WHERE organization_id=?",
          )
          .bind(org)
          .first<number>("n"),
      ).toBe(1);
    }
  }
}
