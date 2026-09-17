import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { handleAccountRoute } from "../../apps/api/src/account";
import { hashSecret, type AuthEnv } from "../../apps/api/src/auth";
import type { ExpertApprovalAccount } from "../../packages/contracts/src/expert-approval";

let mf: Miniflare;
let db: D1Database;
let env: AuthEnv;
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
      name: "expert-account-tests",
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
      "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,?,1,1,?,?)",
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
    cookie: `guteneo_session=${token}`,
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
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,'simulation',?)",
      )
      .bind(id, "Atelier confidentiel", now())
      .run();
  owner = await user(org, "admin");
  member = await user(org, "member");
  outsider = await user(otherOrg, "admin");
  env = {
    DB: db,
    ENVIRONMENT: "local",
    MODE: "simulation",
    APP_ORIGIN: "http://localhost:8787",
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
async function count(table: string, organization = org) {
  return (await db
    .prepare(`SELECT COUNT(*) n FROM ${table} WHERE organization_id=?`)
    .bind(organization)
    .first<{ n: number }>())!.n;
}

const route = "/api/account/expert-approval";
let ownConnection: string;
let memberConnection: string;
let otherAdmin: Login;
let otherAdminConnection: string;
let foreignConnection: string;
let sameUserElsewhere: string;
async function connect(principal: Login) {
  const id = `connection_${crypto.randomUUID()}`;
  await db
    .prepare(
      "INSERT INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)",
    )
    .bind(
      id,
      "https://identity.example/",
      principal.userId,
      `client_${crypto.randomUUID()}`,
      principal.org,
      now(),
      now(),
    )
    .run();
  return id;
}
beforeEach(async () => {
  otherAdmin = await user(org, "admin");
  ownConnection = await connect(owner);
  memberConnection = await connect(member);
  otherAdminConnection = await connect(otherAdmin);
  foreignConnection = await connect(outsider);
  sameUserElsewhere = await connect(
    await user(otherOrg, "admin", owner.userId),
  );
});
const valid = () => ({
  enabled: true,
  channels: ["fax"],
  maxPerDispatchMinor: 500,
  maxDailyMinor: 2500,
  maxDailyCount: 20,
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  acknowledgement: "delegate-approval-v1",
});
async function overview(principal = owner) {
  const response = await handleAccountRoute(req(route, principal), env);
  expect(response?.headers.get("Cache-Control")).toBe("no-store");
  return (await response!.json()) as ExpertApprovalAccount;
}
async function write(
  body: unknown = valid(),
  principal = owner,
  connection = ownConnection,
  currentEnv = env,
) {
  return handleAccountRoute(
    req(`${route}/${connection}`, principal, "PUT", body),
    currentEnv,
  );
}
async function policies() {
  return await db
    .prepare(
      "SELECT * FROM expert_approval_policies WHERE organization_id=? ORDER BY connection_id",
    )
    .bind(org)
    .all();
}
function beforeBatch(effect: () => Promise<unknown>): AuthEnv {
  let injected = false;
  return {
    ...env,
    DB: new Proxy(db, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (!injected) {
              injected = true;
              await effect();
            }
            return db.batch(statements);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  };
}

describe("expert approval browser account boundary", () => {
  it("starts off and exposes only the caller's own connections in the authenticated organization", async () => {
    const data = await overview();
    expect(data.canManage).toBe(true);
    expect(data.day).toBe(now().slice(0, 10));
    expect(data.connections).toEqual([
      expect.objectContaining({
        connectionId: ownConnection,
        status: "active",
        policy: null,
        usage: { count: 0, ceilingMinor: 0 },
      }),
    ]);
    const serialized = JSON.stringify(data);
    for (const forbidden of [
      memberConnection,
      otherAdminConnection,
      foreignConnection,
      sameUserElsewhere,
      owner.hash,
      owner.csrf,
      owner.cookie,
    ])
      expect(serialized).not.toContain(forbidden);
    expect(await count("expert_approval_policies")).toBe(0);
    expect(await count("audit_log")).toBe(0);
    const readOnly = await overview(member);
    expect(readOnly.canManage).toBe(false);
    expect(readOnly.connections.map((c) => c.connectionId)).toEqual([
      memberConnection,
    ]);
  });

  it("requires browser identity, same origin and the current CSRF token for writes", async () => {
    const body = valid();
    for (const [headers, code] of [
      [{ Cookie: "" }, "AUTHENTICATION_REQUIRED"],
      [
        { Authorization: "Bearer never-a-browser-authority" },
        "BROWSER_REQUIRED",
      ],
      [{ "X-CSRF-Token": "" }, "CSRF_REJECTED"],
      [{ "X-CSRF-Token": "old-fixture-token" }, "CSRF_REJECTED"],
      [{ Origin: "https://foreign.example" }, "ORIGIN_REJECTED"],
    ] as [Record<string, string>, string][]) {
      await expect(
        handleAccountRoute(
          req(`${route}/${ownConnection}`, owner, "PUT", body, headers),
          env,
        ),
      ).rejects.toMatchObject({ code });
    }
    await expect(
      handleAccountRoute(
        req(route, owner, "GET", undefined, {
          Authorization: "Bearer blocked-even-with-cookie",
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "BROWSER_REQUIRED" });
    await db
      .prepare("UPDATE browser_sessions SET csrf_token=? WHERE token_hash=?")
      .bind("new-fixture-token", owner.hash)
      .run();
    await expect(write()).rejects.toMatchObject({ code: "CSRF_REJECTED" });
    expect(await count("expert_approval_policies")).toBe(0);
    expect(await count("audit_log")).toBe(0);
  });

  it("permits administrators to manage only their own active OAuth connection", async () => {
    await expect(
      write(valid(), member, memberConnection),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const id of [
      memberConnection,
      otherAdminConnection,
      foreignConnection,
      sameUserElsewhere,
      "missing-connection",
    ])
      await expect(write(valid(), owner, id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    await db
      .prepare("UPDATE authorized_connections SET status='revoked' WHERE id=?")
      .bind(ownConnection)
      .run();
    await expect(write()).rejects.toMatchObject({ code: "CONNECTION_REVOKED" });
    expect(await count("expert_approval_policies")).toBe(0);
    expect(await count("audit_log")).toBe(0);
  });

  it("requires the explicit acknowledgement and rejects privilege fields, malformed values and unsafe bounds", async () => {
    const input = valid();
    const { acknowledgement: _acknowledgement, ...withoutAcknowledgement } =
      input;
    const invalid: unknown[] = [
      withoutAcknowledgement,
      { ...input, acknowledgement: "yes" },
      { ...input, channels: [] },
      { ...input, channels: ["fax", "fax"] },
      { ...input, channels: ["sms"] },
      { ...input, enabled: "true" },
      { ...input, maxPerDispatchMinor: 0 },
      { ...input, maxPerDispatchMinor: 10001 },
      { ...input, maxPerDispatchMinor: 1.1 },
      { ...input, maxDailyMinor: 50001 },
      { ...input, maxDailyMinor: 0 },
      { ...input, maxDailyMinor: "2500" },
      { ...input, maxDailyCount: 0 },
      { ...input, maxDailyCount: 1001 },
      { ...input, maxDailyCount: 1.5 },
      { ...input, expiresAt: "not-a-date" },
      { ...input, userId: otherAdmin.userId },
      { ...input, organizationId: otherOrg },
      { ...input, revision: 999 },
      { enabled: false, acknowledgement: "delegate-approval-v1" },
    ];
    for (const body of invalid)
      await expect(write(body)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
    for (const body of [
      { ...input, maxDailyMinor: input.maxPerDispatchMinor - 1 },
      { ...input, expiresAt: new Date(Date.now() - 1000).toISOString() },
      {
        ...input,
        expiresAt: new Date(Date.now() + 31 * 86_400_000).toISOString(),
      },
    ])
      await expect(write(body)).rejects.toMatchObject({
        code: "EXPERT_POLICY_INVALID",
      });
    expect(await count("expert_approval_policies")).toBe(0);
    expect(await count("audit_log")).toBe(0);
  });

  it("enables, revises and disables one policy with matching immutable-history audit entries", async () => {
    const original = valid();
    expect((await write(original))?.status).toBe(200);
    const enabled = (await overview()).connections[0].policy!;
    expect(enabled).toMatchObject({
      enabled: true,
      revision: 1,
      channels: ["fax"],
      maxPerDispatchMinor: 500,
      maxDailyMinor: 2500,
      maxDailyCount: 20,
      expiresAt: original.expiresAt,
    });
    const revised = {
      ...original,
      channels: ["fax", "postal"],
      maxPerDispatchMinor: 100,
      maxDailyMinor: 300,
      maxDailyCount: 3,
    };
    expect((await write(revised))?.status).toBe(200);
    expect((await overview()).connections[0].policy).toMatchObject({
      enabled: true,
      revision: 2,
      channels: ["fax", "postal"],
      maxPerDispatchMinor: 100,
      maxDailyMinor: 300,
      maxDailyCount: 3,
    });
    expect((await write({ enabled: false }))?.status).toBe(200);
    expect((await overview()).connections[0].policy).toMatchObject({
      enabled: false,
      revision: 3,
    });
    const audit = await db
      .prepare(
        "SELECT action,resource_id,user_id,details_json FROM audit_log WHERE organization_id=? ORDER BY created_at,id",
      )
      .bind(org)
      .all<{
        action: string;
        resource_id: string;
        user_id: string;
        details_json: string;
      }>();
    expect(audit.results).toHaveLength(3);
    expect(audit.results.map((row) => row.action)).toEqual([
      "expert_policy.enabled",
      "expert_policy.enabled",
      "expert_policy.revoked",
    ]);
    for (const row of audit.results) {
      expect(row.resource_id).toBe(ownConnection);
      expect(row.user_id).toBe(owner.userId);
    }
    expect(JSON.parse(audit.results[0].details_json)).toEqual({
      channels: original.channels,
      maxPerDispatchMinor: 500,
      maxDailyMinor: 2500,
      maxDailyCount: 20,
      expiresAt: original.expiresAt,
      acknowledgement: "delegate-approval-v1",
    });
    expect(JSON.parse(audit.results[2].details_json)).toEqual({});
    const encoded = JSON.stringify(audit.results);
    for (const secret of [
      owner.cookie,
      owner.csrf,
      owner.hash,
      "private@example.invalid",
    ])
      expect(encoded).not.toContain(secret);
    expect(
      (await overview(outsider)).connections.every((c) => c.policy === null),
    ).toBe(true);
  });

  it.each(["session", "role"])(
    "rejects a previously valid browser after its %s is revoked",
    async (change) => {
      if (change === "session")
        await db
          .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
          .bind(owner.hash)
          .run();
      else
        await db
          .prepare(
            "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
          )
          .bind(org, owner.userId)
          .run();
      await expect(write()).rejects.toMatchObject({
        code: change === "session" ? "SESSION_EXPIRED" : "FORBIDDEN",
      });
      expect(await count("expert_approval_policies")).toBe(0);
      expect(await count("audit_log")).toBe(0);
    },
  );

  it.each(["session", "role", "connection", "expiry"])(
    "fences policy creation against a concurrent %s revocation before the transaction",
    async (change) => {
      const wrapped = beforeBatch(async () => {
        if (change === "session")
          return db
            .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
            .bind(owner.hash)
            .run();
        if (change === "role")
          return db
            .prepare(
              "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
            )
            .bind(org, owner.userId)
            .run();
        if (change === "connection")
          return db
            .prepare(
              "UPDATE authorized_connections SET status='revoked' WHERE id=?",
            )
            .bind(ownConnection)
            .run();
        return db
          .prepare(
            "UPDATE browser_sessions SET expires_at=? WHERE token_hash=?",
          )
          .bind(new Date(Date.now() - 3600000).toISOString(), owner.hash)
          .run();
      });
      await expect(
        write(valid(), owner, ownConnection, wrapped),
      ).rejects.toMatchObject({ code: "ACCESS_CHANGED" });
      expect(await count("expert_approval_policies")).toBe(0);
      expect(await count("audit_log")).toBe(0);
    },
  );

  it("rolls back a revocation and its audit when the current administrator is demoted before commit", async () => {
    await write();
    const before = await policies();
    const wrapped = beforeBatch(() =>
      db
        .prepare(
          "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
        )
        .bind(org, owner.userId)
        .run(),
    );
    await expect(
      write({ enabled: false }, owner, ownConnection, wrapped),
    ).rejects.toMatchObject({ code: "ACCESS_CHANGED" });
    expect((await policies()).results).toEqual(before.results);
    expect(await count("audit_log")).toBe(1);
  });

  it("fences policy creation when the session CSRF token changes before commit", async () => {
    const wrapped = beforeBatch(() =>
      db
        .prepare("UPDATE browser_sessions SET csrf_token=? WHERE token_hash=?")
        .bind("rotated-csrf-fixture", owner.hash)
        .run(),
    );
    await expect(
      write(valid(), owner, ownConnection, wrapped),
    ).rejects.toMatchObject({ code: "ACCESS_CHANGED" });
    expect(await count("expert_approval_policies")).toBe(0);
    expect(await count("audit_log")).toBe(0);
  });

  it("rechecks verified-account authority within the policy transaction", async () => {
    env = { ...env, MODE: "production", AUTH0_AUTH_POLICY: "verified_email" };
    await db
      .prepare(
        "UPDATE browser_sessions SET is_development=0,mfa=0,verified_account=1 WHERE token_hash=?",
      )
      .bind(owner.hash)
      .run();
    const wrapped = beforeBatch(() =>
      db
        .prepare(
          "UPDATE browser_sessions SET verified_account=0 WHERE token_hash=?",
        )
        .bind(owner.hash)
        .run(),
    );
    await expect(
      write(valid(), owner, ownConnection, wrapped),
    ).rejects.toMatchObject({ code: "ACCESS_CHANGED" });
    expect(await count("expert_approval_policies")).toBe(0);
    expect(await count("audit_log")).toBe(0);
  });
});
