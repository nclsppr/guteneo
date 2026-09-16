import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { handleAccountRoute } from "../../apps/api/src/account";
import { hashSecret, type AuthEnv } from "../../apps/api/src/auth";

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
async function response(
  path: string,
  principal = owner,
  method = "GET",
  body?: unknown,
) {
  return (await (await handleAccountRoute(
    req(path, principal, method, body),
    env,
  ))!.json()) as Record<string, unknown>;
}
async function count(table: string, organization = org) {
  return (await db
    .prepare(`SELECT COUNT(*) n FROM ${table} WHERE organization_id=?`)
    .bind(organization)
    .first<{ n: number }>())!.n;
}

describe("browser account and organization administration", () => {
  it("allows own name updates but restricts workspace changes and rejects privilege fields", async () => {
    const updated = await response("/api/account", member, "PATCH", {
      userName: "  Camille  ",
    });
    expect(updated.user).toMatchObject({
      id: member.userId,
      name: "Camille",
      role: "member",
    });
    await expect(
      handleAccountRoute(
        req("/api/account", member, "PATCH", { organizationName: "Forbidden" }),
        env,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const body of [
      { role: "admin" },
      { userId: owner.userId, userName: "Impersonated" },
      { organizationId: otherOrg, organizationName: "Other" },
      { userName: "\n" },
    ])
      await expect(
        handleAccountRoute(req("/api/account", member, "PATCH", body), env),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const renamed = await response("/api/account", owner, "PATCH", {
      organizationName: "Nouvel atelier",
    });
    expect(renamed.organization).toMatchObject({
      id: org,
      name: "Nouvel atelier",
    });
    const audit = await db
      .prepare("SELECT details_json FROM audit_log WHERE organization_id=?")
      .bind(org)
      .all();
    expect(JSON.stringify(audit.results)).not.toMatch(
      /Camille|Nouvel atelier|confidentiel|private@example/,
    );
  });

  it("requires a real browser session, origin and CSRF, and rejects bearer credentials", async () => {
    await expect(
      handleAccountRoute(
        req("/api/account", owner, "GET", undefined, { Cookie: "" }),
        env,
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    await expect(
      handleAccountRoute(
        req("/api/account", owner, "GET", undefined, {
          Authorization: "Bearer not-allowed",
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "BROWSER_REQUIRED" });
    await expect(
      handleAccountRoute(
        req(
          "/api/account",
          owner,
          "PATCH",
          { userName: "Changed" },
          { "X-CSRF-Token": "wrong" },
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "CSRF_REJECTED" });
    await expect(
      handleAccountRoute(
        req(
          "/api/account",
          owner,
          "PATCH",
          { userName: "Changed" },
          { Origin: "https://other.invalid" },
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "ORIGIN_REJECTED" });
    expect(await count("audit_log")).toBe(0);
  });

  it("paginates members only for the current organization's admin", async () => {
    const first = await response("/api/admin/members?limit=1");
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await response(
      `/api/admin/members?limit=1&cursor=${encodeURIComponent(String(first.nextCursor))}`,
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(JSON.stringify([first, second])).not.toContain(outsider.userId);
    expect(JSON.stringify(first)).not.toMatch(/token|csrf|private@example/);
    await expect(
      handleAccountRoute(req("/api/admin/members", member), env),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      handleAccountRoute(req("/api/admin/members?limit=1000"), env),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("revokes only the caller's session and never exposes a token or token hash", async () => {
    const extra = await login(org, owner.userId);
    const result = await response("/api/account/sessions");
    const encoded = JSON.stringify(result);
    expect(encoded).toContain(extra.publicId);
    expect(encoded).not.toContain(owner.hash);
    expect(encoded).not.toContain(owner.csrf);
    expect(encoded).not.toContain(member.publicId);
    await expect(
      handleAccountRoute(
        req(`/api/account/sessions/${member.publicId}`, owner, "DELETE"),
        env,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      await response(
        `/api/account/sessions/${extra.publicId}`,
        owner,
        "DELETE",
      ),
    ).toMatchObject({ revoked: true, currentSession: false });
    await expect(
      handleAccountRoute(req("/api/account", extra), env),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(
      await response(
        `/api/account/sessions/${owner.publicId}`,
        owner,
        "DELETE",
      ),
    ).toMatchObject({ currentSession: true });
    await expect(
      handleAccountRoute(req("/api/account", owner), env),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("changes member role and revokes browser, assistant and development access atomically within the tenant", async () => {
    const crossTenant = await user(otherOrg, "member", member.userId);
    for (const principal of [member, crossTenant]) {
      await db
        .prepare(
          "INSERT INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)",
        )
        .bind(
          `conn_${crypto.randomUUID()}`,
          "https://identity.example/",
          principal.userId,
          `client_${principal.org}`,
          principal.org,
          now(),
          now(),
        )
        .run();
      await db
        .prepare(
          "INSERT INTO development_mcp_tokens(token_hash,user_id,organization_id,expires_at) VALUES(?,?,?,?)",
        )
        .bind(
          `token_${crypto.randomUUID()}`,
          principal.userId,
          principal.org,
          new Date(Date.now() + 3600000).toISOString(),
        )
        .run();
    }
    expect(
      await response(`/api/admin/members/${member.userId}`, owner, "PATCH", {
        role: "viewer",
      }),
    ).toMatchObject({ updated: true, sessionsRevoked: true });
    await expect(
      handleAccountRoute(req("/api/account", member), env),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(await response("/api/account", crossTenant)).toMatchObject({
      user: { role: "member" },
    });
    expect(await count("development_mcp_tokens")).toBe(0);
    expect(await count("development_mcp_tokens", otherOrg)).toBe(1);
    const connections = await db
      .prepare(
        "SELECT organization_id,status FROM authorized_connections WHERE user_id=?",
      )
      .bind(member.userId)
      .all();
    expect(connections.results).toEqual(
      expect.arrayContaining([
        { organization_id: org, status: "revoked" },
        { organization_id: otherOrg, status: "active" },
      ]),
    );
  });

  it("disconnects a member without removing membership or touching another tenant", async () => {
    await expect(
      handleAccountRoute(
        req(
          `/api/admin/members/${outsider.userId}/revoke-access`,
          owner,
          "POST",
          {},
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await response(
      `/api/admin/members/${member.userId}/revoke-access`,
      owner,
      "POST",
      {},
    );
    await expect(
      handleAccountRoute(req("/api/account", member), env),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    const fresh = await login(org, member.userId);
    expect(await response("/api/account", fresh)).toMatchObject({
      user: { role: "member" },
    });
    expect(await response("/api/account", outsider)).toMatchObject({
      user: { role: "admin" },
    });
  });

  it("preserves the last admin and rolls back audit and revocation on rejection", async () => {
    await expect(
      handleAccountRoute(
        req(`/api/admin/members/${owner.userId}`, owner, "PATCH", {
          role: "viewer",
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "LAST_ADMIN_REQUIRED" });
    expect(await count("audit_log")).toBe(0);
    expect(await response("/api/account")).toMatchObject({
      user: { role: "admin" },
    });
    await expect(
      db
        .prepare(
          "DELETE FROM memberships WHERE organization_id=? AND user_id=?",
        )
        .bind(org, owner.userId)
        .run(),
    ).rejects.toThrow("last_admin_required");
  });

  it("serializes simultaneous demotions so exactly one administrator remains", async () => {
    const second = await user(org, "admin");
    const results = await Promise.allSettled(
      [owner, second].map((principal) =>
        handleAccountRoute(
          req(`/api/admin/members/${principal.userId}`, principal, "PATCH", {
            role: "member",
          }),
          env,
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const admins = await db
      .prepare(
        "SELECT COUNT(*) n FROM memberships WHERE organization_id=? AND role='admin'",
      )
      .bind(org)
      .first<{ n: number }>();
    expect(admins?.n).toBe(1);
    expect(await count("audit_log")).toBe(1);
  });

  it.each(["session", "role"])(
    "rechecks administrator authority inside the batch after a concurrent %s change",
    async (change) => {
      await user(org, "admin");
      let revoked = false;
      const wrappedDb = new Proxy(db, {
        get(target, property) {
          if (property === "batch")
            return async (statements: D1PreparedStatement[]) => {
              if (!revoked) {
                revoked = true;
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
              }
              return db.batch(statements);
            };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      await expect(
        handleAccountRoute(
          req(`/api/admin/members/${member.userId}`, owner, "PATCH", {
            role: "viewer",
          }),
          { ...env, DB: wrappedDb },
        ),
      ).rejects.toMatchObject({ code: "ACCESS_CHANGED" });
      const unchanged = await db
        .prepare(
          "SELECT role FROM memberships WHERE organization_id=? AND user_id=?",
        )
        .bind(org, member.userId)
        .first<{ role: string }>();
      expect(unchanged?.role).toBe("member");
      expect(await count("audit_log")).toBe(0);
    },
  );

  it("stops oversized JSON bodies before profile mutation", async () => {
    await expect(
      handleAccountRoute(
        req("/api/account", owner, "PATCH", { userName: "x".repeat(8192) }),
        env,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 413 });
    expect(await count("audit_log")).toBe(0);
  });

  it("enforces MFA for a hosted administrator and never accepts a hosted development session", async () => {
    const hosted = {
      ...env,
      ENVIRONMENT: "production",
      MODE: "production",
      APP_ORIGIN: "https://guteneo.example",
    };
    const request = new Request(`${hosted.APP_ORIGIN}/api/account`, {
      headers: {
        Cookie: owner.cookie.replace(
          "guteneo_session",
          "__Host-guteneo_session",
        ),
      },
    });
    await expect(handleAccountRoute(request, hosted)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    await db
      .prepare(
        "UPDATE browser_sessions SET is_development=0,mfa=0 WHERE token_hash=?",
      )
      .bind(owner.hash)
      .run();
    await expect(handleAccountRoute(request, hosted)).rejects.toMatchObject({
      code: "MFA_REQUIRED",
    });
  });
});
