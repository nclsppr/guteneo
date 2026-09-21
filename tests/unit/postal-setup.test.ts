import { readFile, readdir } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { handlePostalSetupRoute } from "../../apps/api/src/postal-setup";
import type { Env } from "../../apps/api/src/env";
import type { Fetcher } from "../../packages/providers";
import type { PostalSetup } from "../../packages/contracts/src/postal-setup";
import { hashSecret } from "../../apps/api/src/auth";

let mf: Miniflare;
let db: D1Database;
let env: Env;
let profileCountry = "LU";
let beforeProfile: (() => Promise<void>) | undefined;
let calls: string[];
const providerFetch: Fetcher = async (url, init) => {
  const path = new URL(String(url)).pathname;
  calls.push(`${init?.method ?? "GET"} ${path}`);
  if (path === "/auth/access-tokens")
    return Response.json({
      access_token: "fixture-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "organisation_read",
    });
  if (path === "/organisations/pingen_org") {
    await beforeProfile?.();
    return Response.json({
      data: {
        id: "pingen_org",
        type: "organisations",
        attributes: {
          billing_currency: "EUR",
          default_country: profileCountry,
          default_address_position: "left",
        },
      },
    });
  }
  throw new Error("No other provider call permitted");
};
let org: string;
let otherOrg: string;
let owner: Login;
let member: Login;
let outsider: Login;
type Login = {
  userId: string;
  org: string;
  cookie: string;
  csrf: string;
  hash: string;
  publicId: string;
};
const now = () => new Date().toISOString();
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "account-tests",
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
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${filename}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    for (const rawLine of sql.split("\n")) {
      const line = rawLine.trim();
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
});
afterAll(async () => {
  await mf?.dispose();
});
afterEach(() => {
  vi.useRealTimers();
});

async function user(
  organization: string,
  role: string,
  userId = `user_${crypto.randomUUID()}`,
) {
  await db
    .prepare(
      "INSERT OR IGNORE INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
    )
    .bind(userId, "Nom confidentiel", "private@example.invalid", now())
    .run();
  await db
    .prepare(
      "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,?,?)",
    )
    .bind(organization, userId, role, now())
    .run();
  return login(organization, userId);
}
async function login(organization: string, userId: string): Promise<Login> {
  const token = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("base64url");
  const hash = await hashSecret(token);
  const csrf = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,?,0,0,?,?,1)",
    )
    .bind(
      hash,
      userId,
      organization,
      csrf,
      now(),
      new Date(Date.now() + 3600000).toISOString(),
    )
    .run();
  const session = await db
    .prepare("SELECT public_id FROM browser_sessions WHERE token_hash=?")
    .bind(hash)
    .first<{ public_id: string }>();
  return {
    userId,
    org: organization,
    cookie: `__Host-guteneo_session=${token}`,
    csrf,
    hash,
    publicId: session!.public_id,
  };
}
beforeEach(async () => {
  org = `org_${crypto.randomUUID()}`;
  otherOrg = `org_${crypto.randomUUID()}`;
  for (const id of [org, otherOrg])
    await db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,'production',?)",
      )
      .bind(id, "Atelier confidentiel", now())
      .run();
  for (const id of [org, otherOrg])
    await db
      .prepare("INSERT INTO channel_controls VALUES(?,'postal',0)")
      .bind(id)
      .run();
  profileCountry = "LU";
  beforeProfile = undefined;
  calls = [];
  owner = await user(org, "admin");
  member = await user(org, "member");
  outsider = await user(otherOrg, "admin");
  env = {
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
    PINGEN_ORGANIZATION_ID: "pingen_org",
    PINGEN_DEFAULT_COUNTRY: "LU",
    PINGEN_WEBHOOK_SECRET: "fixture-webhook-secret",
    PINGEN_UPLOAD_ORIGINS: "https://upload.pingen.example",
    DOCUMENTS: {} as R2Bucket,
    DISPATCH_QUEUE: {} as Queue<{ dispatchId: string }>,
    BULK_QUEUE: {} as Queue<{ dispatchId: string }>,
    ASSETS: {} as Env["ASSETS"],
  };
});
function req(
  path: string,
  principal = owner,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${env.APP_ORIGIN}${path}`, {
    method,
    headers: {
      Origin: env.APP_ORIGIN,
      Cookie: principal.cookie,
      "X-CSRF-Token": principal.csrf,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function response(
  path: string,
  principal = owner,
  method = "GET",
  body?: unknown,
) {
  return (await (await handlePostalSetupRoute(
    req(path, principal, method, body),
    env,
    { fetcher: providerFetch },
  ))!.json()) as PostalSetup;
}
async function count(table: string, organization = org) {
  return (await db
    .prepare(`SELECT COUNT(*) n FROM ${table} WHERE organization_id=?`)
    .bind(organization)
    .first<{ n: number }>())!.n;
}

const input = {
  name: "Atelier exemple",
  address: "12 rue du Test\nL-1234 Luxembourg",
  authorized: true,
};
const route = "/api/postal/setup";
const setup = (
  principal = owner,
  body: unknown = input,
  headers: Record<string, string> = {},
) =>
  handlePostalSetupRoute(req(route, principal, "POST", body, headers), env, {
    fetcher: providerFetch,
  });

describe("self-service postal activation", () => {
  it("reads setup status for members without provider calls or writes", async () => {
    expect(await response(route, member)).toMatchObject({
      available: true,
      configured: false,
      canManage: false,
      channelEnabled: false,
      reason: "setup_required",
      senderVerification: null,
    });
    expect(calls).toEqual([]);
    expect(await count("senders")).toBe(0);
    expect(
      await handlePostalSetupRoute(req("/api/postal/requirements"), env),
    ).toBeNull();
  });

  it("atomically installs the genuine declared sender, 8 calculator policies and tenant channel without funding or provider transfer", async () => {
    const grants = await count("welcome_credit_grants");
    const result = (await (await setup())!.json()) as PostalSetup;
    expect(result).toMatchObject({
      available: true,
      configured: true,
      canManage: true,
      channelEnabled: true,
      pricingBasis: "public_list_price_ex_tax",
      senderVerification: "administrator_declaration",
      sender: { name: input.name, address: input.address, status: "verified" },
    });
    expect(await count("senders")).toBe(1);
    expect(await count("postal_sender_declarations")).toBe(1);
    expect(await count("trusted_delivery_costs")).toBe(8);
    expect(await count("welcome_credit_grants")).toBe(grants);
    expect(await count("dispatches")).toBe(0);
    expect(await count("provider_drafts")).toBe(0);
    expect(calls).toEqual([
      "POST /auth/access-tokens",
      "GET /organisations/pingen_org",
    ]);
    const declaration = await db
      .prepare(
        "SELECT * FROM postal_sender_declarations WHERE organization_id=?",
      )
      .bind(org)
      .first();
    expect(declaration).toMatchObject({
      user_id: owner.userId,
      authorization_basis: "authenticated_administrator_declaration",
      physical_address_verified: 0,
      submission_origin: "browser_administrator_declaration",
      oauth_client_id: null,
      oauth_connection_id: null,
    });
    const policies = (
      await db
        .prepare("SELECT * FROM trusted_delivery_costs WHERE organization_id=?")
        .bind(org)
        .all()
    ).results;
    expect(new Set(policies.map((p) => p.options_json)).size).toBe(8);
    expect(
      policies.every(
        (p) =>
          p.pricing_basis === "public_list_price_ex_tax" &&
          p.base_numerator === 0 &&
          p.byte_numerator === 0 &&
          p.account_id === "pingen_org" &&
          p.source_sha256 === policies[0].source_sha256,
      ),
    ).toBe(true);
    const audits = (
      await db
        .prepare("SELECT details_json FROM audit_log WHERE organization_id=?")
        .bind(org)
        .all()
    ).results;
    expect(JSON.stringify(audits)).not.toContain(input.address);
    expect(JSON.stringify(audits)).not.toContain(input.name);
    expect(await response(route, outsider)).toMatchObject({
      configured: false,
      channelEnabled: false,
    });
    expect(await count("senders", otherOrg)).toBe(0);
  });

  it("allows independent existing and future organizations to self-activate", async () => {
    await setup();
    await setup(outsider, { ...input, name: "Autre atelier" });
    expect(await response(route, outsider)).toMatchObject({
      configured: true,
      sender: { name: "Autre atelier" },
    });
    expect(await response(route, owner)).toMatchObject({
      configured: true,
      sender: { name: input.name },
    });
  });

  it("keeps concurrent identical setup idempotent with no duplicate identity, prices or grants", async () => {
    const results = await Promise.all([setup(), setup(), setup()]);
    expect(results.every((r) => r?.status === 200)).toBe(true);
    expect(await count("senders")).toBe(1);
    expect(await count("postal_sender_declarations")).toBe(1);
    expect(await count("trusted_delivery_costs")).toBe(8);
    expect(await count("welcome_credit_grants")).toBe(1);
    const callCount = calls.length;
    await setup();
    expect(calls).toHaveLength(callCount);
    await expect(
      setup(owner, { ...input, name: "Replacement" }),
    ).rejects.toMatchObject({ code: "POSTAL_SENDER_EXISTS" });
  });

  it("requires browser authority, administrator, same-origin CSRF and explicit declaration", async () => {
    await expect(
      setup(owner, input, { Authorization: "Bearer ignored" }),
    ).rejects.toMatchObject({ code: "BROWSER_REQUIRED" });
    await expect(setup(member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      setup(owner, input, { "X-CSRF-Token": "wrong" }),
    ).rejects.toMatchObject({ code: "CSRF_REJECTED" });
    await expect(
      setup(owner, input, { Origin: "https://attacker.example" }),
    ).rejects.toMatchObject({ code: "ORIGIN_REJECTED" });
    for (const body of [
      { ...input, authorized: false },
      { ...input, organizationId: otherOrg },
      { ...input, priceMinor: 1 },
      { ...input, senderId: "invented" },
      { ...input, address: "tiny" },
    ])
      await expect(setup(owner, body)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
    expect(calls).toEqual([]);
    expect(await count("senders")).toBe(0);
  });

  it("fences session revocation between provider inspection and the atomic write", async () => {
    beforeProfile = async () => {
      await db
        .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
        .bind(owner.hash)
        .run();
    };
    await expect(setup()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(await count("senders")).toBe(0);
    expect(await count("trusted_delivery_costs")).toBe(0);
    expect(await count("postal_sender_declarations")).toBe(0);
  });

  it("fences administrator demotion between provider inspection and the atomic write", async () => {
    await user(org, "admin");
    beforeProfile = async () => {
      await db
        .prepare(
          "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
        )
        .bind(org, owner.userId)
        .run();
    };
    await expect(setup()).rejects.toMatchObject({ code: "ACCESS_CHANGED" });
    expect(await count("senders")).toBe(0);
    expect(await count("trusted_delivery_costs")).toBe(0);
  });

  it("never reopens an operator stop, including one concurrent with initial setup", async () => {
    beforeProfile = async () => {
      await db
        .prepare(
          "INSERT INTO audit_log VALUES(?,?,?,'channel.control','postal','{\"enabled\":false}',?)",
        )
        .bind(crypto.randomUUID(), org, owner.userId, now())
        .run();
    };
    await expect(setup()).rejects.toMatchObject({ code: "ACCESS_CHANGED" });
    expect(await count("senders")).toBe(0);
    expect(await response(route)).toMatchObject({
      reason: "channel_stopped",
      channelEnabled: false,
    });
    await expect(setup()).rejects.toMatchObject({
      code: "POSTAL_SETUP_REVIEW_REQUIRED",
    });
  });

  it("never re-enables an existing channel, disabled sender or revoked pricing", async () => {
    await setup();
    await db
      .prepare(
        "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='postal'",
      )
      .bind(org)
      .run();
    await expect(setup()).rejects.toMatchObject({
      code: "POSTAL_SETUP_REVIEW_REQUIRED",
    });
    await db
      .prepare(
        "UPDATE channel_controls SET enabled=1 WHERE organization_id=? AND channel='postal'",
      )
      .bind(org)
      .run();
    await db
      .prepare("UPDATE senders SET status='disabled' WHERE organization_id=?")
      .bind(org)
      .run();
    await expect(setup()).rejects.toMatchObject({
      code: "POSTAL_SETUP_REVIEW_REQUIRED",
    });
    await db
      .prepare("UPDATE senders SET status='verified' WHERE organization_id=?")
      .bind(org)
      .run();
    await db
      .prepare(
        "UPDATE trusted_delivery_costs SET status='revoked' WHERE organization_id=?",
      )
      .bind(org)
      .run();
    await expect(setup()).rejects.toMatchObject({
      code: "POSTAL_SETUP_REVIEW_REQUIRED",
    });
    expect(await count("trusted_delivery_costs")).toBe(8);
  });

  it("does not bypass pre-existing operator sender qualification", async () => {
    await db
      .prepare(
        "INSERT INTO senders VALUES(?,?,'postal',?,?,'pending','production',?)",
      )
      .bind(crypto.randomUUID(), org, input.name, input.address, now())
      .run();
    await expect(setup()).rejects.toMatchObject({
      code: "POSTAL_SETUP_REVIEW_REQUIRED",
    });
    expect(await count("postal_sender_declarations")).toBe(0);
  });

  it("fails closed for missing configuration and an unexpected Pingen country", async () => {
    env.LIVE_SEND_CHANNELS = "fax";
    expect(await response(route)).toMatchObject({
      available: false,
      reason: "service_unavailable",
    });
    await expect(setup()).rejects.toMatchObject({
      code: "POSTAL_SETUP_UNAVAILABLE",
    });
    expect(calls).toEqual([]);
    env.LIVE_SEND_CHANNELS = "postal";
    profileCountry = "FR";
    await expect(setup()).rejects.toMatchObject({
      code: "POSTAL_PROFILE_UNQUALIFIED",
    });
    expect(await count("senders")).toBe(0);
  });

  it("retains immutable declaration evidence", async () => {
    await setup();
    await expect(
      db
        .prepare(
          "UPDATE postal_sender_declarations SET sender_name='Changed' WHERE organization_id=?",
        )
        .bind(org)
        .run(),
    ).rejects.toThrow("immutable_postal_sender_declaration");
    await expect(
      db
        .prepare(
          "DELETE FROM postal_sender_declarations WHERE organization_id=?",
        )
        .bind(org)
        .run(),
    ).rejects.toThrow("immutable_postal_sender_declaration");
  });

  it("renews only expired current policies under a fresh explicit declaration, retaining previous evidence", async () => {
    await setup();
    const first = await response(route);
    const future = Date.now() + 91 * 86400000;
    await db
      .prepare("UPDATE browser_sessions SET expires_at=? WHERE token_hash=?")
      .bind(new Date(future + 3600000).toISOString(), owner.hash)
      .run();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(future);
    expect(await response(route)).toMatchObject({
      configured: false,
      reason: "pricing_expired",
    });
    expect(await count("trusted_delivery_costs")).toBe(8);
    const result = (await (await setup())!.json()) as PostalSetup;
    expect(result).toMatchObject({
      configured: true,
      channelEnabled: true,
      sender: { id: first.sender!.id },
    });
    expect(await count("postal_sender_declarations")).toBe(1);
    expect(await count("postal_setup_policy_generations")).toBe(2);
    expect(await count("trusted_delivery_costs")).toBe(16);
    expect(await count("welcome_credit_grants")).toBe(1);
    const policies = (
      await db
        .prepare(
          "SELECT status FROM trusted_delivery_costs WHERE organization_id=?",
        )
        .bind(org)
        .all<{ status: string }>()
    ).results;
    expect(policies.filter((p) => p.status === "revoked")).toHaveLength(8);
    expect(policies.filter((p) => p.status === "qualified")).toHaveLength(8);
    await setup();
    expect(await count("postal_setup_policy_generations")).toBe(2);
  });

  it("does not renew a revoked expired policy or automatically accept a changed account profile", async () => {
    await setup();
    const future = Date.now() + 91 * 86400000;
    await db
      .prepare("UPDATE browser_sessions SET expires_at=? WHERE token_hash=?")
      .bind(new Date(future + 3600000).toISOString(), owner.hash)
      .run();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(future);
    profileCountry = "FR";
    await expect(setup()).rejects.toMatchObject({
      code: "POSTAL_PROFILE_UNQUALIFIED",
    });
    profileCountry = "LU";
    await db
      .prepare(
        "UPDATE trusted_delivery_costs SET status='revoked' WHERE id=(SELECT id FROM trusted_delivery_costs WHERE organization_id=? LIMIT 1)",
      )
      .bind(org)
      .run();
    await expect(setup()).rejects.toMatchObject({
      code: "POSTAL_SETUP_REVIEW_REQUIRED",
    });
    expect(await count("postal_setup_policy_generations")).toBe(1);
    expect(await count("trusted_delivery_costs")).toBe(8);
  });

  it("rolls back sender, declaration, pricing and channel when the transaction fails", async () => {
    env.DB = {
      prepare: db.prepare.bind(db),
      batch: (statements: D1PreparedStatement[]) =>
        db.batch([
          ...statements,
          db.prepare("INSERT INTO deliberately_missing_table VALUES(1)"),
        ]),
    } as D1Database;
    await expect(setup()).rejects.toThrow();
    env.DB = db;
    expect(await count("senders")).toBe(0);
    expect(await count("postal_sender_declarations")).toBe(0);
    expect(await count("trusted_delivery_costs")).toBe(0);
    expect(await count("postal_setup_policy_generations")).toBe(0);
    expect(await response(route)).toMatchObject({
      configured: false,
      channelEnabled: false,
    });
  });
});
