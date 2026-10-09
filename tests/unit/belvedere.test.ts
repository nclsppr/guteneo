import { createFaxUsageFixture } from "../helpers/fax-usage-fixture";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  authorizeBelvedere,
  belvedereFilters,
  handleBelvedereRoute,
} from "../../apps/api/src/belvedere";
import {
  recordConnectionEvent,
  connectionCountry,
  cleanupBelvedereTelemetry,
} from "../../apps/api/src/belvedere-telemetry";
import { hashSecret } from "../../apps/api/src/auth";
import { servePublicAssets } from "../../apps/api/src/public-assets";
import type { Env } from "../../apps/api/src/env";
import type {
  BelvedereWorkshopDetail,
  BelvedereOverview,
  BelvedereFinance,
  BelvedereConnections,
  BelvedereJob,
  BelvederePage,
} from "../../packages/contracts/src/belvedere";
let mf: Miniflare;
let db: D1Database;
let env: Env;
let cookie: string;
let sessionHash: string;
const origin = "https://belvedere.example.test";
const slug = "fixture-secret-slug-abcdefghijklmnopqrstuvwxyz";
const base = `/belvedere/${slug}`;
const stamp = new Date().toISOString();
const from = stamp.slice(0, 10);
const request = (path: string, extra: RequestInit = {}) =>
  new Request(`${origin}${path}`, {
    ...extra,
    headers: { Cookie: cookie, ...extra.headers },
  });
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "belvedere-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const filename of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${filename}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    for (const raw of sql.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (line.startsWith("CREATE TRIGGER") && !line.endsWith("END;"))
        trigger = true;
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await db.prepare(statement).run();
        statement = "";
        trigger = false;
      }
    }
  }
  env = {
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: origin,
    AUTH0_DOMAIN: "identity.example.test",
    AUTH0_AUTH_POLICY: "verified_email",
    BELVEDERE_SECRET_SLUG: slug,
    ASSETS: {
      fetch: async () =>
        new Response("<html><head></head><body>App</body></html>", {
          headers: { "Content-Type": "text/html" },
        }),
    },
  } as unknown as Env;
  for (const [id, name, mode] of [
    ["org_owner", "Mon atelier", "production"],
    ["org_other", "Autre atelier", "production"],
    ["org_sim", "Simulation isolée", "simulation"],
  ])
    await db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,?,?)",
      )
      .bind(id, name, mode, stamp)
      .run();
  for (const [id, email] of [
    ["usr_owner", "nicolas@pieper.fr"],
    ["usr_other", "person@example.test"],
  ])
    await db
      .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)")
      .bind(id, id, email, stamp)
      .run();
  await db.batch([
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_owner','usr_owner','admin',?)",
      )
      .bind(stamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_other','usr_other','admin',?)",
      )
      .bind(stamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_sim','usr_owner','admin',?)",
      )
      .bind(stamp),
    db
      .prepare(
        "INSERT INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://identity.example.test/','auth0|owner','usr_owner',?)",
      )
      .bind(stamp),
  ]);
  const token = "A".repeat(43);
  cookie = `__Host-guteneo_session=${token}`;
  sessionHash = await hashSecret(token);
  await db
    .prepare(
      "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,'usr_owner','org_owner','csrf',1,0,?,?,1)",
    )
    .bind(sessionHash, stamp, new Date(Date.now() + 3600000).toISOString())
    .run();
  await db
    .prepare(
      "INSERT INTO browser_identity_evidence(token_hash,issuer,subject,verified_email,authenticated_at) VALUES(?,'https://identity.example.test/','auth0|owner','nicolas@pieper.fr',?)",
    )
    .bind(sessionHash, stamp)
    .run();
  await db
    .prepare(
      "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES('sender_sim','org_sim','email','Private sender','sender-sensitive@example.test','verified','simulation',?)",
    )
    .bind(stamp)
    .run();
  await db
    .prepare(
      `INSERT INTO dispatches(id,organization_id,channel,recipient_json,sender_id,sender_address,subject,text,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES('dispatch_sim','org_sim','email','{"email":"recipient-sensitive@example.test"}','sender_sim','sender-sensitive@example.test','Sensitive subject','Sensitive contents','{}','prepared','simulation',17,20,'EUR','fingerprint','prepare','request',?,?)`,
    )
    .bind(stamp, stamp)
    .run();
});
afterAll(async () => {
  await mf?.dispose();
});
describe("Belvédère exclusive browser authority", () => {
  it("grants only configured production browser proof and hides all other principals", async () => {
    expect(await authorizeBelvedere(request(base), env)).toBe("usr_owner");
    for (const modified of [
      { ...env, BELVEDERE_SECRET_SLUG: undefined },
      { ...env, BELVEDERE_SECRET_SLUG: "short" },
      { ...env, MODE: "simulation" as const },
      { ...env, ENVIRONMENT: "local" as const },
      { ...env, BELVEDERE_AUTH0_SUBJECT: "auth0|another" },
      { ...env, AUTH0_DOMAIN: "foreign.example.test" },
    ])
      expect(
        (await handleBelvedereRoute(request(base), modified))?.status,
      ).toBe(404);
    for (const Authorization of [
      "Bearer valid-looking-token",
      "GuteneoNative valid-looking-token",
    ])
      expect(
        (
          await handleBelvedereRoute(
            request(base, { headers: { Authorization } }),
            env,
          )
        )?.status,
      ).toBe(404);
    expect(
      (await handleBelvedereRoute(request(base, { method: "POST" }), env))
        ?.status,
    ).toBe(404);
    expect(
      (
        await handleBelvedereRoute(
          request(base, { headers: { "Sec-Fetch-Site": "cross-site" } }),
          env,
        )
      )?.status,
    ).toBe(404);
  });
  it("does not grant from mutable user email or stale unproved sessions", async () => {
    await db
      .prepare(
        "UPDATE browser_identity_evidence SET verified_email='other@example.test' WHERE token_hash=?",
      )
      .bind(sessionHash)
      .run();
    expect((await handleBelvedereRoute(request(base), env))?.status).toBe(404);
    await db
      .prepare(
        "UPDATE browser_identity_evidence SET verified_email='nicolas@pieper.fr' WHERE token_hash=?",
      )
      .bind(sessionHash)
      .run();
    await db
      .prepare(
        "UPDATE browser_sessions SET is_development=1 WHERE token_hash=?",
      )
      .bind(sessionHash)
      .run();
    expect(
      (await handleBelvedereRoute(request(base + "/api/overview"), env))
        ?.status,
    ).toBe(404);
    await db
      .prepare(
        "UPDATE browser_sessions SET is_development=0 WHERE token_hash=?",
      )
      .bind(sessionHash)
      .run();
  });
  it("renders marker only after auth and keeps the route out of static handling", async () => {
    const response = await handleBelvedereRoute(request(base), env);
    expect(response?.status).toBe(200);
    expect(await response!.text()).toContain(
      `<meta name="guteneo-belvedere" content="${base}">`,
    );
    expect(response?.headers.get("Cache-Control")).toContain("no-store");
    expect(await servePublicAssets(request(base), env)).toBeNull();
    const signedOut = await handleBelvedereRoute(
      new Request(`${origin}${base}`),
      env,
    );
    expect(signedOut?.status).toBe(302);
    expect(signedOut?.headers.get("Location")).toContain(
      "/auth/login?returnTo=",
    );
    expect(
      (
        await handleBelvedereRoute(
          new Request(`${origin}/belvedere/not-the-secret`),
          env,
        )
      )?.status,
    ).toBe(404);
  });
});
describe("read-only cross-workshop projections", () => {
  it("defaults to real workshops and separates deterministic simulation", async () => {
    const overview = (await (await handleBelvedereRoute(
      request(base + "/api/overview"),
      env,
    ))!.json()) as BelvedereOverview;
    expect(overview.totals.workshops).toBe(2);
    expect(overview.totals.members).toBe(2);
    expect(overview.totals.dispatches).toBe(0);
    expect(overview.trend).toHaveLength(30);
    const simulated = (await (await handleBelvedereRoute(
      request(base + "/api/overview?mode=simulation"),
      env,
    ))!.json()) as BelvedereOverview;
    expect(simulated.totals.dispatches).toBe(1);
    expect(simulated.totals.workshops).toBe(1);
  });
  it("reads foreign workshop metadata but never delivery content or recipients", async () => {
    const detail = (await (await handleBelvedereRoute(
      request(base + "/api/workshops/org_sim?mode=simulation"),
      env,
    ))!.json()) as BelvedereWorkshopDetail;
    expect(detail.workshop.id).toBe("org_sim");
    expect(detail.dispatches.items[0]).toMatchObject({
      id: "dispatch_sim",
      customerActualMinor: null,
      reservedMinor: 0,
      supplierVerifiedMinor: null,
    });
    expect(JSON.stringify(detail)).not.toMatch(
      /recipient-sensitive|Sensitive subject|Sensitive contents|sender-sensitive|token_hash|csrf_token/,
    );
    expect(
      (
        await handleBelvedereRoute(
          request(base + "/api/workshops/org_other"),
          env,
        )
      )?.status,
    ).toBe(200);
    expect(
      (
        await handleBelvedereRoute(
          request(base + "/api/workshops/org_missing"),
          env,
        )
      )?.status,
    ).toBe(404);
  });
  it("keeps grants distinct from unknown revenue and costs", async () => {
    const data = (await (await handleBelvedereRoute(
      request(base + "/api/finance"),
      env,
    ))!.json()) as BelvedereFinance;
    expect(data.promotionalGrantedMinor).toBe(10000);
    expect(data.cashReceived).toEqual([]);
    expect(data.cashStatus).toBe("unconfigured");
    expect(data.supplierVerified).toEqual([]);
    expect(data.netResultMinor).toBeNull();
  });
  it("paginates and validates all filters", async () => {
    const data = (await (await handleBelvedereRoute(
      request(base + "/api/workshops?pageSize=1&page=2"),
      env,
    ))!.json()) as { items: unknown[]; total: number };
    expect(data.total).toBe(2);
    expect(data.items).toHaveLength(1);
    for (const suffix of [
      "?pageSize=101",
      "?page=0",
      "?mode=bad",
      "?mode=all",
      "?from=2020-01-01&to=2026-01-01",
      "?from=2026-02-31",
      "?q=" + "x".repeat(101),
    ])
      expect(
        (
          await handleBelvedereRoute(
            request(base + "/api/overview" + suffix),
            env,
          )
        )?.status,
      ).toBe(400);
    expect(() => belvedereFilters(new URL(origin + "?page=NaN"))).toThrow();
    const empty = await (await handleBelvedereRoute(
      request(base + "/api/members?q=does-not-exist"),
      env,
    ))!.json();
    expect(empty).toMatchObject({ items: [], total: 0 });
  });
  it("returns exact cash per currency without combining promotional or test-mode money", async () => {
    await db
      .prepare(
        "INSERT INTO billing_accounts(organization_id,livemode,customer_id,provision_started_at,created_at,updated_at) VALUES('org_other',1,'cus_fixture',0,?,?)",
      )
      .bind(stamp, stamp)
      .run();
    for (const [id, currency, amount] of [
      ["pay_eur", "eur", 1234],
      ["pay_usd", "usd", 5678],
    ] as const)
      await db
        .prepare(
          "INSERT INTO billing_payments(organization_id,livemode,customer_id,id,status,currency,amount_minor,amount_received_minor,created,synced_at) VALUES('org_other',1,'cus_fixture',?,'succeeded',?,?,?,?,?)",
        )
        .bind(
          id,
          currency,
          amount,
          amount,
          Math.floor(Date.parse(stamp) / 1000),
          stamp,
        )
        .run();
    const data = (await (await handleBelvedereRoute(
      request(base + "/api/finance"),
      env,
    ))!.json()) as BelvedereFinance;
    expect(data.cashReceived).toEqual([
      { currency: "EUR", amountMinor: 1234 },
      { currency: "USD", amountMinor: 5678 },
    ]);
    expect(data.promotionalGrantedMinor).toBe(10000);
    expect(data.customerConsumptionMinor).toBe(0);
    expect(data.netResultMinor).toBeNull();
    const simulation = (await (await handleBelvedereRoute(
      request(base + "/api/finance?mode=simulation"),
      env,
    ))!.json()) as BelvedereFinance;
    expect(simulation.cashReceived).toEqual([]);
    expect(simulation.promotionalGrantedMinor).toBe(0);
  });
  it("paginates every member of a large workshop without changing dispatch pagination", async () => {
    const statements = [];
    for (let i = 0; i < 101; i++) {
      const id = `member_bulk_${String(i).padStart(3, "0")}`;
      statements.push(
        db
          .prepare(
            "INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
          )
          .bind(id, `Membre ${i}`, `${id}@example.test`, stamp),
      );
      statements.push(
        db
          .prepare(
            "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_other',?,'viewer',?)",
          )
          .bind(id, stamp),
      );
    }
    for (let i = 0; i < statements.length; i += 50)
      await db.batch(statements.slice(i, i + 50));
    const detail = (await (await handleBelvedereRoute(
      request(base + "/api/workshops/org_other?membersPage=2"),
      env,
    ))!.json()) as BelvedereWorkshopDetail;
    expect(detail.membersTotal).toBe(102);
    expect(detail.members).toHaveLength(2);
    expect(detail.membersPage).toBe(2);
    expect(detail.dispatches.page).toBe(1);
    expect(detail.members.every((m) => m.workshopsTotal === 1)).toBe(true);
    const all = (await (await handleBelvedereRoute(
      request(base + "/api/members?workshopId=org_other&pageSize=100"),
      env,
    ))!.json()) as { items: unknown[]; total: number };
    expect(all.total).toBe(102);
    expect(all.items).toHaveLength(100);
  });
  it("gates optional Cloudflare reads and reports missing credentials honestly", async () => {
    for (const path of ["/api/infrastructure", "/api/infrastructure/billing"]) {
      expect(
        (
          await handleBelvedereRoute(
            request(base + path, {
              headers: { Authorization: "Bearer token" },
            }),
            env,
          )
        )?.status,
      ).toBe(404);
      const data = (await (await handleBelvedereRoute(
        request(base + path),
        env,
      ))!.json()) as { status: string };
      expect(data.status).toBe("not_configured");
    }
  });
  it("projects a globe of declared postal destinations and keeps email and unqualified fax countries unknown", async () => {
    for (const [id, channel, recipient] of [
      [
        "dispatch_postal",
        "postal",
        {
          name: "Recipient secret",
          line1: "Address secret",
          city: "Paris",
          postalCode: "75001",
          country: "FR",
        },
      ],
      ["dispatch_fax", "fax", { phone: "+33123456789" }],
    ]) {
      await db
        .prepare(
          "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,'org_sim',?,'Sender','private-sender','verified','simulation',?)",
        )
        .bind(`sender_${id}`, channel, stamp)
        .run();
      await db
        .prepare(
          "INSERT INTO dispatches(id,organization_id,channel,recipient_json,sender_id,sender_address,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES(?,'org_sim',?,?,?,'private-sender','{}','prepared','simulation',17,20,'EUR',?,?,?,?,?)",
        )
        .bind(
          id,
          channel,
          JSON.stringify(recipient),
          `sender_${id}`,
          id,
          id,
          id,
          stamp,
          stamp,
        )
        .run();
    }
    const overview = (await (await handleBelvedereRoute(
      request(base + "/api/overview?mode=simulation"),
      env,
    ))!.json()) as BelvedereOverview;
    expect(overview.distributionCountries).toContainEqual({
      country: "FR",
      dispatches: 1,
      delivered: 0,
      channels: [{ channel: "postal", dispatches: 1 }],
    });
    expect(
      overview.distributionCountries.find((c) => c.country === null)
        ?.dispatches,
    ).toBe(2);
    expect(overview.statuses).toEqual([{ status: "prepared", dispatches: 3 }]);
    const jobs = (await (await handleBelvedereRoute(
      request(
        base +
          "/api/jobs?mode=simulation&country=FR&channel=postal&status=prepared",
      ),
      env,
    ))!.json()) as BelvederePage<BelvedereJob>;
    expect(jobs.total).toBe(1);
    expect(jobs.items[0]).toMatchObject({
      id: "dispatch_postal",
      workshopId: "org_sim",
      destinationCountry: "FR",
    });
    expect(JSON.stringify(jobs)).not.toMatch(
      /Recipient secret|Address secret|75001|33123456789|private-sender/,
    );
    const unknown = (await (await handleBelvedereRoute(
      request(
        base + "/api/jobs?mode=simulation&country=unknown&pageSize=1&page=2",
      ),
      env,
    ))!.json()) as BelvederePage<BelvedereJob>;
    expect(unknown.total).toBe(2);
    expect(unknown.items).toHaveLength(1);
    const search = (await (await handleBelvedereRoute(
      request(base + "/api/jobs?mode=simulation&q=dispatch_fax"),
      env,
    ))!.json()) as BelvederePage<BelvedereJob>;
    expect(search.items[0].id).toBe("dispatch_fax");
    for (const query of [
      "channel=bad",
      "status=bad",
      "country=Address",
      "statusGroup=bad",
    ]) {
      expect(
        (await handleBelvedereRoute(request(base + "/api/jobs?" + query), env))
          ?.status,
      ).toBe(400);
    }
    const none = (await (await handleBelvedereRoute(
      request(base + "/api/jobs?mode=production"),
      env,
    ))!.json()) as BelvederePage<BelvedereJob>;
    expect(none.total).toBe(0);
  });
  it("uses the immutable qualified fax country without exposing the number", async () => {
    const fixture = await createFaxUsageFixture(db, () => Date.now());
    const dispatch = await fixture.domain.prepareDispatch(
      fixture.ctx,
      { ...fixture.input, ceilingMinor: 100 },
      crypto.randomUUID(),
    );
    const path = base + `/api/jobs?q=${dispatch.id}&channel=fax&country=FR`;
    const data = (await (await handleBelvedereRoute(
      request(path),
      env,
    ))!.json()) as BelvederePage<BelvedereJob>;
    expect(data.total).toBe(1);
    expect(data.items[0].destinationCountry).toBe("FR");
    expect(JSON.stringify(data)).not.toContain(fixture.input.recipient.phone);
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=?",
      )
      .bind(fixture.ctx.organizationId)
      .run();
    const historical = (await (await handleBelvedereRoute(
      request(path),
      env,
    ))!.json()) as BelvederePage<BelvedereJob>;
    expect(historical.items[0].destinationCountry).toBe("FR");
  });
  it("opens exact attention and delayed job metadata without retrying anything", async () => {
    await db
      .prepare("UPDATE dispatches SET status='failed' WHERE id='dispatch_fax'")
      .run();
    await db
      .prepare(
        "INSERT INTO outbox(id,dispatch_id,organization_id,status,created_at) VALUES('outbox_sim','dispatch_postal','org_sim','pending',?)",
      )
      .bind(new Date(Date.now() - 120000).toISOString())
      .run();
    for (const [statusGroup, id] of [
      ["attention", "dispatch_fax"],
      ["delayed", "dispatch_postal"],
    ]) {
      const data = (await (await handleBelvedereRoute(
        request(base + `/api/jobs?mode=simulation&statusGroup=${statusGroup}`),
        env,
      ))!.json()) as BelvederePage<BelvedereJob>;
      expect(data.total).toBe(1);
      expect(data.items[0].id).toBe(id);
    }
    const unchanged = await db
      .prepare("SELECT status FROM dispatches WHERE id='dispatch_fax'")
      .first();
    expect(unchanged).toEqual({ status: "failed" });
  });
  it("audits only safe action codes and refuses unknown routes", async () => {
    expect(
      (await handleBelvedereRoute(request(base + "/api/not-real"), env))
        ?.status,
    ).toBe(404);
    const logs = await db.prepare("SELECT * FROM platform_access_audit").all();
    expect(logs.results.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(slug);
    expect(JSON.stringify(logs)).not.toContain("nicolas@pieper.fr");
  });
});
describe("country telemetry", () => {
  it("trusts request.cf only and deduplicates MCP observations", async () => {
    const forged = request(base, {
      headers: { "CF-IPCountry": "US", "X-Forwarded-For": "192.0.2.1" },
    });
    expect(connectionCountry(forged)).toBeNull();
    const trusted = request(base);
    Object.defineProperty(trusted, "cf", { value: { country: "LU" } });
    expect(connectionCountry(trusted)).toBe("LU");
    const event = {
      organizationId: "org_other",
      userId: "usr_other",
      kind: "mcp" as const,
      connectionId: "connection-public",
    };
    await recordConnectionEvent(db, trusted, event);
    await recordConnectionEvent(db, trusted, event);
    const data = (await (await handleBelvedereRoute(
      request(base + `/api/connections?from=${from}&to=${from}`),
      env,
    ))!.json()) as BelvedereConnections;
    expect(data.events.total).toBe(1);
    expect(data.countries).toEqual([{ country: "LU", connections: 1 }]);
    expect(JSON.stringify(data)).not.toMatch(/192\.0\.2\.1|token_hash/);
  });
  it("leaves old session geography unknown and expires history", async () => {
    const data = (await (await handleBelvedereRoute(
      request(base + "/api/connections"),
      env,
    ))!.json()) as BelvedereConnections;
    expect(data.current.items[0].country).toBeNull();
    await db
      .prepare(
        "UPDATE connection_events SET occurred_at='2020-01-01T00:00:00.000Z' WHERE connection_id='connection-public'",
      )
      .run();
    await cleanupBelvedereTelemetry(db);
    expect(
      (
        await db
          .prepare("SELECT count(*) total FROM connection_events")
          .first<{ total: number }>()
      )?.total,
    ).toBe(0);
  });
});
