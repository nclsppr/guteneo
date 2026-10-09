import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { handleAccountRoute } from "../../apps/api/src/account";
import { MAX_WORKSPACE_CONTACTS } from "../../packages/contracts/src/account-identity";
import {
  handleAuthRoute,
  hashSecret,
  type AuthEnv,
} from "../../apps/api/src/auth";

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
  it("identifies the current account by email without making it editable through the profile", async () => {
    await db
      .prepare("UPDATE users SET email=? WHERE id=?")
      .bind("camille@example.test", member.userId)
      .run();
    expect(await response("/api/account", member)).toMatchObject({
      user: {
        id: member.userId,
        email: "camille@example.test",
        role: "member",
      },
      simulation: true,
    });
    const session = await handleAuthRoute(req("/api/session", member), env);
    expect(await session!.json()).toMatchObject({
      user: { email: "camille@example.test", role: "member" },
    });
    await expect(
      handleAccountRoute(
        req("/api/account", member, "PATCH", {
          email: "admin@example.test",
          role: "admin",
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await db
      .prepare("UPDATE users SET email='' WHERE id=?")
      .bind(member.userId)
      .run();
    expect(await response("/api/account", member)).toMatchObject({
      user: { email: null, role: "member" },
    });
  });

  it("lets every workshop role find only current administrators and supervisors with their actual authority", async () => {
    const supervisor = await user(org, "supervisor");
    const reportingSupervisor = await user(org, "supervisor");
    const viewer = await user(org, "viewer");
    await db
      .prepare(
        "UPDATE memberships SET supervisor_can_approve=1 WHERE organization_id=? AND user_id=?",
      )
      .bind(org, supervisor.userId)
      .run();
    await db
      .prepare(
        "UPDATE memberships SET supervisor_can_report=1 WHERE organization_id=? AND user_id=?",
      )
      .bind(org, reportingSupervisor.userId)
      .run();
    await db
      .prepare("UPDATE users SET email=? WHERE id=?")
      .bind("approver@example.test", supervisor.userId)
      .run();
    for (const principal of [owner, supervisor, member, viewer]) {
      const result = await response("/api/account/contacts", principal);
      const items = result.items as Array<{
        id: string;
        permissions: Record<string, boolean>;
      }>;
      expect(items.map((item) => item.id).sort()).toEqual(
        [owner.userId, supervisor.userId, reportingSupervisor.userId]
          .filter((id) => id !== principal.userId)
          .sort(),
      );
      expect(result.hasMore).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(
        /sessions|connections|joinedAt|csrf|token|verifiedAccount/,
      );
      expect(JSON.stringify(result)).not.toContain(outsider.userId);
      if (principal.userId !== supervisor.userId) {
        expect(
          items.find((item) => item.id === supervisor.userId),
        ).toMatchObject({
          email: "approver@example.test",
          role: "supervisor",
          permissions: {
            approveDispatches: true,
            viewReports: false,
            manageMembers: false,
            manageBilling: false,
          },
        });
      }
      expect(
        items.find((item) => item.id === reportingSupervisor.userId),
      ).toMatchObject({
        permissions: {
          approveDispatches: false,
          viewReports: true,
          manageMembers: false,
        },
      });
    }
    // Contacts remain reachable without an active login, but current membership
    // and current capabilities determine who is responsible for each action.
    await db
      .prepare(
        "DELETE FROM browser_sessions WHERE organization_id=? AND user_id=?",
      )
      .bind(org, supervisor.userId)
      .run();
    expect(await response("/api/account/contacts", member)).toMatchObject({
      items: expect.arrayContaining([
        {
          id: supervisor.userId,
          name: "Nom confidentiel",
          email: "approver@example.test",
          role: "supervisor",
          permissions: expect.objectContaining({ approveDispatches: true }),
        },
      ]),
    });
    await db
      .prepare(
        "UPDATE memberships SET supervisor_can_approve=0 WHERE organization_id=? AND user_id=?",
      )
      .bind(org, supervisor.userId)
      .run();
    expect(await response("/api/account/contacts", member)).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: supervisor.userId,
          permissions: expect.objectContaining({ approveDispatches: false }),
        }),
      ]),
    });
    await db
      .prepare(
        "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
      )
      .bind(org, supervisor.userId)
      .run();
    await db
      .prepare(
        "DELETE FROM browser_sessions WHERE organization_id=? AND user_id=?",
      )
      .bind(org, reportingSupervisor.userId)
      .run();
    await db
      .prepare("DELETE FROM memberships WHERE organization_id=? AND user_id=?")
      .bind(org, reportingSupervisor.userId)
      .run();
    expect(await response("/api/account/contacts", member)).toMatchObject({
      items: [expect.objectContaining({ id: owner.userId, role: "admin" })],
    });
  });

  it("bounds help contacts and prioritizes administrators without returning the full member list", async () => {
    const statements: D1PreparedStatement[] = [];
    for (let i = 0; i < MAX_WORKSPACE_CONTACTS; i++) {
      const id = `contact_${crypto.randomUUID()}`;
      statements.push(
        db
          .prepare(
            "INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
          )
          .bind(id, "Supervisor", "", now()),
        db
          .prepare(
            "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'supervisor',?)",
          )
          .bind(org, id, now()),
      );
    }
    await db.batch(statements);
    const result = await response("/api/account/contacts", member);
    const items = result.items as Array<{ id: string; email: string | null }>;
    expect(items).toHaveLength(MAX_WORKSPACE_CONTACTS);
    expect(items[0].id).toBe(owner.userId);
    expect(items[1].email).toBeNull();
    expect(result.hasMore).toBe(true);
    const soleAdmin = await response("/api/account/contacts", outsider);
    expect(soleAdmin).toEqual({ items: [], hasMore: false });
  });

  it("keeps help contacts browser-only and rechecks caller access in the contact lookup", async () => {
    await expect(
      handleAccountRoute(
        req("/api/account/contacts", member, "GET", undefined, {
          Authorization: "Bearer forbidden",
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "BROWSER_REQUIRED" });
    await expect(
      handleAccountRoute(
        req("/api/account/contacts", member, "GET", undefined, { Cookie: "" }),
        env,
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    await expect(
      handleAccountRoute(
        req(`/api/account/contacts?organizationId=${otherOrg}`, member),
        env,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const wrapped = new Proxy(db, {
      get(target, property) {
        if (property === "prepare")
          return (query: string) => {
            const statement = target.prepare(query);
            if (!query.includes("m.role IN ('admin','supervisor')"))
              return statement;
            return {
              bind: (...args: unknown[]) => ({
                all: async () => {
                  await db
                    .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
                    .bind(member.hash)
                    .run();
                  return statement.bind(...args).all();
                },
              }),
            };
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const result = await handleAccountRoute(
      req("/api/account/contacts", member),
      { ...env, DB: wrapped },
    );
    expect(await result!.json()).toEqual({ items: [], hasMore: false });
  });

  it("persists the signed-in user's language across sessions without changing other members or workspaces", async () => {
    expect(await response("/api/account", member)).toMatchObject({
      user: { preferredLocale: null },
    });
    const updated = await response("/api/account", member, "PATCH", {
      preferredLocale: "lb",
    });
    expect(updated).toMatchObject({
      user: { id: member.userId, preferredLocale: "lb" },
    });
    const secondSession = await login(org, member.userId);
    const session = await handleAuthRoute(
      req("/api/session", secondSession),
      env,
    );
    expect(await session!.json()).toMatchObject({
      user: { id: member.userId, preferredLocale: "lb" },
    });
    for (const principal of [owner, outsider])
      expect(await response("/api/account", principal)).toMatchObject({
        user: { preferredLocale: null },
      });
    // A person's preference follows them to another authenticated membership.
    const samePerson = await user(otherOrg, "member", member.userId);
    expect(await response("/api/account", samePerson)).toMatchObject({
      user: { preferredLocale: "lb" },
    });
    const audit = await db
      .prepare(
        "SELECT details_json FROM audit_log WHERE organization_id=? AND user_id=?",
      )
      .bind(org, member.userId)
      .first<{ details_json: string }>();
    expect(JSON.parse(audit!.details_json)).toEqual({
      fields: ["preferredLocale"],
    });
  });
  it("preserves the saved language when older clients update only profile names", async () => {
    await response("/api/account", member, "PATCH", { preferredLocale: "de" });
    expect(
      await response("/api/account", member, "PATCH", { userName: "Camille" }),
    ).toMatchObject({ user: { name: "Camille", preferredLocale: "de" } });
    for (const locale of ["fr", "en", "de", "lb"])
      expect(
        await response("/api/account", member, "PATCH", {
          preferredLocale: locale,
        }),
      ).toMatchObject({ user: { preferredLocale: locale } });
  });
  it("rejects unsupported locale values, foreign user fields and writes without browser CSRF", async () => {
    for (const preferredLocale of ["es", "de-DE", "EN", "", null, 1, ["en"]])
      await expect(
        handleAccountRoute(
          req("/api/account", member, "PATCH", { preferredLocale }),
          env,
        ),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      handleAccountRoute(
        req("/api/account", member, "PATCH", {
          userId: owner.userId,
          preferredLocale: "en",
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      handleAccountRoute(
        req(
          "/api/account",
          member,
          "PATCH",
          {
            preferredLocale: "en",
          },
          { "X-CSRF-Token": "" },
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "CSRF_REJECTED" });
    expect(await response("/api/account", member)).toMatchObject({
      user: { preferredLocale: null },
    });
    expect(await count("audit_log")).toBe(0);
    await expect(
      db
        .prepare("UPDATE users SET preferred_locale='es' WHERE id=?")
        .bind(member.userId)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });
  it("rechecks revoked membership before committing a language preference", async () => {
    const wrapped = new Proxy(db, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            await db
              .prepare(
                "DELETE FROM browser_sessions WHERE user_id=? AND organization_id=?",
              )
              .bind(member.userId, org)
              .run();
            await db
              .prepare(
                "DELETE FROM memberships WHERE user_id=? AND organization_id=?",
              )
              .bind(member.userId, org)
              .run();
            return db.batch(statements);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      handleAccountRoute(
        req("/api/account", member, "PATCH", {
          preferredLocale: "en",
        }),
        { ...env, DB: wrapped },
      ),
    ).rejects.toMatchObject({ code: "ACCESS_CHANGED" });
    expect(
      await db
        .prepare("SELECT preferred_locale FROM users WHERE id=?")
        .bind(member.userId)
        .first(),
    ).toEqual({ preferred_locale: null });
    expect(await count("audit_log")).toBe(0);
  });
  it("allows verified-email beta administrators to manage the account while retaining honest MFA status", async () => {
    env = { ...env, MODE: "production", AUTH0_AUTH_POLICY: "verified_email" };
    await db
      .prepare(
        "UPDATE browser_sessions SET is_development=0,mfa=0,verified_account=1 WHERE token_hash=?",
      )
      .bind(owner.hash)
      .run();
    const result = await response("/api/account", owner, "PATCH", {
      organizationName: "Beta verified workspace",
    });
    expect(result).toMatchObject({
      mfa: false,
      verifiedAccount: true,
      organization: { name: "Beta verified workspace" },
      permissions: { manageOrganization: true },
    });
    await db
      .prepare(
        "UPDATE browser_sessions SET verified_account=0 WHERE token_hash=?",
      )
      .bind(owner.hash)
      .run();
    await expect(
      handleAccountRoute(
        req("/api/account", owner, "PATCH", {
          organizationName: "Must remain unchanged",
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_VERIFICATION_REQUIRED" });
    expect(
      await db
        .prepare("SELECT name FROM organizations WHERE id=?")
        .bind(org)
        .first(),
    ).toEqual({ name: "Beta verified workspace" });
  });
  it("rechecks the verified-account proof within the mutation transaction", async () => {
    env = { ...env, MODE: "production", AUTH0_AUTH_POLICY: "verified_email" };
    await db
      .prepare(
        "UPDATE browser_sessions SET is_development=0,mfa=0,verified_account=1 WHERE token_hash=?",
      )
      .bind(owner.hash)
      .run();
    let revoked = false;
    const wrapped = new Proxy(db, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (!revoked) {
              revoked = true;
              await db
                .prepare(
                  "UPDATE browser_sessions SET verified_account=0 WHERE token_hash=?",
                )
                .bind(owner.hash)
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
        req("/api/account", owner, "PATCH", {
          organizationName: "Must remain unchanged",
        }),
        { ...env, DB: wrapped },
      ),
    ).rejects.toMatchObject({ code: "ACCESS_CHANGED" });
    expect(await count("audit_log")).toBe(0);
    expect(
      await db
        .prepare("SELECT name FROM organizations WHERE id=?")
        .bind(org)
        .first(),
    ).toEqual({ name: "Atelier confidentiel" });
  });
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
    expect(JSON.stringify(first)).not.toMatch(/token|csrf/);
    expect(first.items).toEqual([
      expect.objectContaining({ email: "private@example.invalid" }),
    ]);
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
