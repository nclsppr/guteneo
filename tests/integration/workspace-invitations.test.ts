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
import { hashSecret } from "../../apps/api/src/auth";
import {
  acceptWorkspaceInvitation,
  getInvitationPreview,
  handleInvitationRoute,
} from "../../apps/api/src/invitations";
import type { WorkspaceInvitation } from "../../packages/contracts/src/invitations";

type InvitationEnv = Parameters<typeof handleInvitationRoute>[1];
type Principal = {
  id: string;
  org: string;
  token: string;
  hash: string;
  csrf: string;
  email: string;
};
let mf: Miniflare, db: D1Database, env: InvitationEnv;
let admin: Principal, member: Principal, other: Principal;
const stamp = () => new Date().toISOString();
const future = () => new Date(Date.now() + 3600000).toISOString();
const secret = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
const random = () => crypto.randomUUID();
async function sql(source: string) {
  let statement = "",
    trigger = false;
  const statements: D1PreparedStatement[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line}\n`;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      statements.push(db.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw Error("Incomplete migration");
  if (statements.length) await db.batch(statements);
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await sql(
      await readFile(
        new URL(`../../migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
});
afterAll(async () => mf?.dispose());
afterEach(() => vi.restoreAllMocks());
async function principal(org: string, role = "admin"): Promise<Principal> {
  const id = `invited_user_${random()}`,
    token = secret(),
    hash = await hashSecret(token),
    csrf = secret(),
    email = `${random()}@example.invalid`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Fictional colleague',?,?)",
      )
      .bind(id, email, stamp()),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,?,?)",
      )
      .bind(org, id, role, stamp()),
    db
      .prepare(
        "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,?,1,1,?,?,1)",
      )
      .bind(hash, id, org, csrf, stamp(), future()),
  ]);
  return { id, org, token, hash, csrf, email };
}
async function organization() {
  const org = `invitation_org_${random()}`;
  await db
    .prepare(
      "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Atelier fictif','simulation',?)",
    )
    .bind(org, stamp())
    .run();
  return org;
}
beforeEach(async () => {
  const org = await organization();
  admin = await principal(org);
  member = await principal(org, "member");
  other = await principal(await organization());
  env = {
    DB: db,
    MODE: "simulation",
    ENVIRONMENT: "local",
    APP_ORIGIN: "http://localhost:8787",
  };
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    Error("No real provider call is allowed in this test"),
  );
});
function request(
  path: string,
  actor = admin,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${env.APP_ORIGIN}${path}`, {
    method,
    headers: {
      Origin: env.APP_ORIGIN,
      Cookie: `${env.ENVIRONMENT === "local" ? "" : "__Host-"}guteneo_session=${actor.token}`,
      "X-CSRF-Token": actor.csrf,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function create(
  emails = ["new@example.invalid"],
  extra: Record<string, unknown> = {},
  configured = env,
) {
  const result = await handleInvitationRoute(
    request("/api/admin/invitations", admin, "POST", {
      emails,
      role: "member",
      ...extra,
    }),
    configured,
  );
  expect(result!.status).toBe(201);
  return (await result!.json()) as {
    items: WorkspaceInvitation[];
    simulation: boolean;
  };
}
function token(invitation: WorkspaceInvitation) {
  return new URLSearchParams(new URL(invitation.previewUrl!).hash.slice(1)).get(
    "token",
  )!;
}
async function count(table: string) {
  return (await db
    .prepare(`SELECT count(*) n FROM ${table} WHERE organization_id=?`)
    .bind(admin.org)
    .first<{ n: number }>())!.n;
}
async function newUser(email: string) {
  const id = `new_user_${random()}`;
  const statement = db
    .prepare(
      "INSERT INTO users(id,name,email,created_at) VALUES(?,'Invited colleague',?,?)",
    )
    .bind(id, email, stamp());
  return { id, statement };
}
function race(change: () => Promise<unknown>) {
  let changed = false;
  return new Proxy(db, {
    get(target, key) {
      if (key === "batch")
        return async (statements: D1PreparedStatement[]) => {
          if (!changed) {
            changed = true;
            await change();
          }
          return target.batch(statements);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
async function production(enabled = false) {
  await db.batch([
    db
      .prepare("UPDATE organizations SET mode='production' WHERE id=?")
      .bind(admin.org),
    db
      .prepare(
        "UPDATE browser_sessions SET is_development=0 WHERE token_hash=?",
      )
      .bind(admin.hash),
  ]);
  env = {
    ...env,
    MODE: "production",
    ENVIRONMENT: "production",
    APP_ORIGIN: "https://guteneo.example",
    AUTH0_AUTH_POLICY: "verified_email",
    INVITATION_EMAILS_ENABLED: enabled ? "true" : "false",
    INVITATION_EMAIL_FROM: "invitations@guteneo.com",
    RESEND_API_KEY: "fixture-only-key",
    RESEND_ACCOUNT_ID: "fixture-account",
    RESEND_DOMAIN_ID: "fixture-domain",
    RESEND_VERIFIED_DOMAIN: "guteneo.com",
  };
}

describe("workspace invitations — actual D1, synthetic delivery only", () => {
  it("creates a normalized batch with independent supervisor rights, hashed tokens and no simulated network call", async () => {
    const created = await create(
      [" Colleague@Example.Invalid ", "second@example.invalid"],
      {
        role: "supervisor",
        supervisorCanApprove: true,
        supervisorCanReport: false,
      },
    );
    expect(created.simulation).toBe(true);
    expect(created.items).toHaveLength(2);
    for (const invitation of created.items) {
      expect(invitation).toMatchObject({
        role: "supervisor",
        supervisorCanApprove: true,
        supervisorCanReport: false,
        status: "pending",
        deliveryStatus: "simulated",
      });
      expect(token(invitation)).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const row = await db
        .prepare(
          "SELECT token_hash,email FROM workspace_invitations WHERE id=?",
        )
        .bind(invitation.id)
        .first<{ token_hash: string; email: string }>();
      expect(row!.token_hash).toBe(await hashSecret(token(invitation)));
      expect(row!.email).toBe(row!.email.toLowerCase().trim());
      expect(
        JSON.stringify(
          await db
            .prepare("SELECT * FROM audit_log WHERE organization_id=?")
            .bind(admin.org)
            .all(),
        ),
      ).not.toContain(invitation.email);
      expect(JSON.stringify(row)).not.toContain(token(invitation));
    }
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    const listed = await handleInvitationRoute(
      request("/api/admin/invitations"),
      env,
    );
    expect(JSON.stringify(await listed!.json())).not.toContain("previewUrl");
  });

  it("limits creation and listing to current browser administrators with CSRF", async () => {
    for (const method of ["GET", "POST"]) {
      await expect(
        handleInvitationRoute(
          request(
            "/api/admin/invitations",
            member,
            method,
            method === "POST"
              ? { emails: ["x@example.invalid"], role: "member" }
              : undefined,
          ),
          env,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
      handleInvitationRoute(
        request(
          "/api/admin/invitations",
          admin,
          "POST",
          { emails: ["x@example.invalid"], role: "member" },
          { "X-CSRF-Token": "forged" },
        ),
        env,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      handleInvitationRoute(
        request(
          "/api/admin/invitations",
          admin,
          "POST",
          { emails: ["x@example.invalid"], role: "member" },
          { Authorization: "Bearer fixture" },
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "BROWSER_REQUIRED" });
    expect(await count("workspace_invitations")).toBe(0);
  });

  it.each([
    { emails: ["not-an-email"], role: "member" },
    {
      emails: ["Same@example.invalid", "same@example.invalid"],
      role: "member",
    },
    {
      emails: ["x@example.invalid"],
      role: "viewer",
      supervisorCanApprove: true,
    },
    {
      emails: Array.from(
        { length: 101 },
        (_, i) => `person${i}@example.invalid`,
      ),
      role: "member",
    },
  ])(
    "validates the whole request before storing any invitation: %j",
    async (input) => {
      await expect(
        handleInvitationRoute(
          request("/api/admin/invitations", admin, "POST", input),
          env,
        ),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(await count("workspace_invitations")).toBe(0);
      expect(await count("audit_log")).toBe(0);
    },
  );

  it("rolls back the batch for an existing member or pending duplicate", async () => {
    await expect(
      create(["fresh@example.invalid", member.email]),
    ).rejects.toMatchObject({ code: "INVITATION_EXISTING_MEMBER" });
    expect(await count("workspace_invitations")).toBe(0);
    expect(await count("audit_log")).toBe(0);
    await create();
    await expect(
      create(["fresh@example.invalid", "new@example.invalid"]),
    ).rejects.toMatchObject({ code: "INVITATION_PENDING" });
    expect(await count("workspace_invitations")).toBe(1);
    expect(await count("audit_log")).toBe(1);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it.each(["session", "role"])(
    "rechecks creator authority inside the creation transaction after concurrent %s loss",
    async (change) => {
      await principal(admin.org);
      const configured = {
        ...env,
        DB: race(() =>
          change === "session"
            ? db
                .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
                .bind(admin.hash)
                .run()
            : db
                .prepare(
                  "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
                )
                .bind(admin.org, admin.id)
                .run(),
        ),
      };
      await expect(create(undefined, {}, configured)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await count("workspace_invitations")).toBe(0);
      expect(await count("audit_log")).toBe(0);
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    },
  );

  it("paginates within an atelier and forbids revoking another atelier’s invitation", async () => {
    const { items } = await create(["a@example.invalid", "b@example.invalid"]);
    const first = (await (await handleInvitationRoute(
      request("/api/admin/invitations?limit=1"),
      env,
    ))!.json()) as { items: WorkspaceInvitation[]; nextCursor: string };
    const second = (await (await handleInvitationRoute(
      request(
        `/api/admin/invitations?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`,
      ),
      env,
    ))!.json()) as { items: WorkspaceInvitation[]; nextCursor: null };
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)),
    ).toEqual(new Set(items.map((item) => item.id)));
    expect(second.nextCursor).toBeNull();
    expect(
      await (await handleInvitationRoute(
        request("/api/admin/invitations", other),
        env,
      ))!.json(),
    ).toMatchObject({ items: [] });
    await expect(
      handleInvitationRoute(
        request(
          `/api/admin/invitations/${items[0].id}/revoke`,
          other,
          "POST",
          {},
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    expect((await getInvitationPreview(env, token(items[0]))).status).toBe(
      "pending",
    );
  });

  it("shows a masked preview and rejects wrong-email, wrong-mode and unknown tokens", async () => {
    const invitation = (await create()).items[0],
      raw = token(invitation);
    const preview = await getInvitationPreview(env, raw);
    expect(preview).toMatchObject({
      organization: { name: "Atelier fictif" },
      maskedEmail: "n***@example.invalid",
      role: "member",
      status: "pending",
    });
    expect(JSON.stringify(preview)).not.toContain("new@example.invalid");
    await expect(
      getInvitationPreview({ ...env, MODE: "production" }, raw),
    ).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    await expect(getInvitationPreview(env, secret())).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE",
    });
    const user = await newUser("different@example.invalid");
    await expect(
      acceptWorkspaceInvitation(
        env,
        await hashSecret(raw),
        "different@example.invalid",
        user.id,
        [user.statement],
      ),
    ).rejects.toMatchObject({ code: "INVITATION_EMAIL_MISMATCH" });
    expect(
      await db.prepare("SELECT id FROM users WHERE id=?").bind(user.id).first(),
    ).toBeNull();
  });

  it("accepts only once and atomically installs the reviewed role with the new verified identity", async () => {
    const invitation = (
      await create(undefined, {
        role: "supervisor",
        supervisorCanApprove: false,
        supervisorCanReport: true,
      })
    ).items[0];
    const raw = token(invitation),
      user = await newUser(invitation.email);
    expect(
      await acceptWorkspaceInvitation(
        env,
        await hashSecret(raw),
        " NEW@EXAMPLE.INVALID ",
        user.id,
        [user.statement],
      ),
    ).toEqual({ organizationId: admin.org });
    expect(
      await db
        .prepare(
          "SELECT role,supervisor_can_approve,supervisor_can_report FROM memberships WHERE organization_id=? AND user_id=?",
        )
        .bind(admin.org, user.id)
        .first(),
    ).toEqual({
      role: "supervisor",
      supervisor_can_approve: 0,
      supervisor_can_report: 1,
    });
    expect((await getInvitationPreview(env, raw)).status).toBe("accepted");
    await expect(
      acceptWorkspaceInvitation(
        env,
        await hashSecret(raw),
        invitation.email,
        user.id,
      ),
    ).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    expect(await count("workspace_invitation_acceptances")).toBe(1);
  });

  it("does not create a personal atelier when an existing user joins an invited atelier", async () => {
    const invitation = (await create([other.email], { role: "viewer" }))
      .items[0];
    expect(
      await acceptWorkspaceInvitation(
        env,
        await hashSecret(token(invitation)),
        other.email,
        other.id,
      ),
    ).toEqual({ organizationId: admin.org });
    expect(
      (
        await db
          .prepare(
            "SELECT organization_id,role FROM memberships WHERE user_id=? ORDER BY organization_id",
          )
          .bind(other.id)
          .all()
      ).results,
    ).toEqual(
      expect.arrayContaining([
        { organization_id: admin.org, role: "viewer" },
        { organization_id: other.org, role: "admin" },
      ]),
    );
    expect(
      await db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id=?")
        .bind(other.id)
        .first(),
    ).toEqual({ n: 2 });
  });

  it.each(["revoke", "admin"])(
    "rolls back new identity creation when invitation %s authority changes before acceptance",
    async (change) => {
      const invitation = (await create()).items[0];
      await principal(admin.org);
      const user = await newUser(invitation.email);
      const configured = {
        ...env,
        DB: race(() =>
          change === "revoke"
            ? db
                .prepare(
                  "UPDATE workspace_invitations SET status='revoked',revoked_at=? WHERE id=?",
                )
                .bind(stamp(), invitation.id)
                .run()
            : db
                .prepare(
                  "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
                )
                .bind(admin.org, admin.id)
                .run(),
        ),
      };
      await expect(
        acceptWorkspaceInvitation(
          configured,
          await hashSecret(token(invitation)),
          invitation.email,
          user.id,
          [user.statement],
        ),
      ).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
      expect(
        await db
          .prepare("SELECT id FROM users WHERE id=?")
          .bind(user.id)
          .first(),
      ).toBeNull();
      expect(await count("workspace_invitation_acceptances")).toBe(0);
    },
  );

  it("allows only one concurrent acceptance and retains no losing user or membership", async () => {
    const invitation = (await create()).items[0],
      hash = await hashSecret(token(invitation));
    const users = await Promise.all([
      newUser(invitation.email),
      newUser(invitation.email),
    ]);
    const results = await Promise.allSettled(
      users.map((user) =>
        acceptWorkspaceInvitation(env, hash, invitation.email, user.id, [
          user.statement,
        ]),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await db
        .prepare("SELECT count(*) n FROM users WHERE id IN (?,?)")
        .bind(...users.map((user) => user.id))
        .first(),
    ).toEqual({ n: 1 });
    expect(await count("workspace_invitation_acceptances")).toBe(1);
  });

  it("expires an old link and allows an explicitly requested replacement without reviving it", async () => {
    const raw = secret(),
      hash = await hashSecret(raw);
    const createdAt = new Date(Date.now() - 86400000).toISOString();
    const expiredAt = new Date(Date.now() - 1000).toISOString();
    const id = `expired_${random()}`;
    await db
      .prepare(
        "INSERT INTO workspace_invitations(id,organization_id,email,token_hash,role,invited_by,status,delivery_status,created_at,expires_at) VALUES(?,?,?,?,'member',?,'pending','simulated',?,?)",
      )
      .bind(
        id,
        admin.org,
        "expired@example.invalid",
        hash,
        admin.id,
        createdAt,
        expiredAt,
      )
      .run();
    expect((await getInvitationPreview(env, raw)).status).toBe("expired");
    const user = await newUser("expired@example.invalid");
    await expect(
      acceptWorkspaceInvitation(env, hash, "expired@example.invalid", user.id, [
        user.statement,
      ]),
    ).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    const replacement = (await create(["expired@example.invalid"])).items[0];
    expect(replacement.id).not.toBe(id);
    expect(
      await db
        .prepare("SELECT status FROM workspace_invitations WHERE id=?")
        .bind(id)
        .first(),
    ).toEqual({ status: "expired" });
    expect((await getInvitationPreview(env, token(replacement))).status).toBe(
      "pending",
    );
    await expect(
      acceptWorkspaceInvitation(env, hash, "expired@example.invalid", user.id, [
        user.statement,
      ]),
    ).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
  });

  it("enforces the daily limit atomically across a batch", async () => {
    await db
      .prepare(
        "INSERT INTO workspace_invitations(id,organization_id,email,token_hash,role,invited_by,status,delivery_status,created_at,expires_at) SELECT 'daily_'||?||'_'||value,?,'person'||value||'@example.invalid',printf('%064x',value),'member',?,'pending','simulated',?,? FROM json_each(?)",
      )
      .bind(
        admin.org,
        admin.org,
        admin.id,
        stamp(),
        future(),
        JSON.stringify(Array.from({ length: 499 }, (_, i) => i + 1)),
      )
      .run();
    await expect(
      create(["limit-a@example.invalid", "limit-b@example.invalid"]),
    ).rejects.toMatchObject({ code: "INVITATION_DAILY_LIMIT" });
    expect(await count("workspace_invitations")).toBe(499);
    expect(await count("audit_log")).toBe(0);
    await create(["limit-a@example.invalid"]);
    expect(await count("workspace_invitations")).toBe(500);
    await expect(create(["limit-b@example.invalid"])).rejects.toMatchObject({
      code: "INVITATION_DAILY_LIMIT",
    });
    expect(await count("workspace_invitations")).toBe(500);
  });

  it("does not revive outstanding invitations when an inviter is demoted then restored", async () => {
    const invitation = (await create()).items[0];
    await principal(admin.org);
    await db
      .prepare(
        "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
      )
      .bind(admin.org, admin.id)
      .run();
    await db
      .prepare(
        "UPDATE memberships SET role='admin' WHERE organization_id=? AND user_id=?",
      )
      .bind(admin.org, admin.id)
      .run();
    expect((await getInvitationPreview(env, token(invitation))).status).toBe(
      "revoked",
    );
    const user = await newUser(invitation.email);
    await expect(
      acceptWorkspaceInvitation(
        env,
        await hashSecret(token(invitation)),
        invitation.email,
        user.id,
        [user.statement],
      ),
    ).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    expect(
      await db.prepare("SELECT id FROM users WHERE id=?").bind(user.id).first(),
    ).toBeNull();
  });

  it("keeps production invitations closed before explicit email activation", async () => {
    await production();
    await expect(create()).rejects.toMatchObject({
      code: "INVITATION_DELIVERY_DISABLED",
    });
    expect(await count("workspace_invitations")).toBe(0);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("fences a concurrent administrator demotion before any provider transfer", async () => {
    await principal(admin.org);
    await production(true);
    let revoked = false;
    const wrappedDb = new Proxy(db, {
      get(target, property) {
        if (property === "prepare")
          return (source: string) => {
            const prepared = target.prepare(source);
            if (!source.includes("SET delivery_status='unknown'"))
              return prepared;
            const wrap = (
              statement: D1PreparedStatement,
            ): D1PreparedStatement =>
              new Proxy(statement, {
                get(inner, key) {
                  if (key === "bind")
                    return (...values: unknown[]) =>
                      wrap(inner.bind(...values));
                  if (key === "run")
                    return async () => {
                      if (!revoked) {
                        revoked = true;
                        await db
                          .prepare(
                            "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
                          )
                          .bind(admin.org, admin.id)
                          .run();
                      }
                      return inner.run();
                    };
                  const value = Reflect.get(inner, key);
                  return typeof value === "function"
                    ? value.bind(inner)
                    : value;
                },
              });
            return wrap(prepared);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const result = await create(undefined, {}, { ...env, DB: wrappedDb });
    expect(revoked).toBe(true);
    expect(result.items[0].status).toBe("revoked");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(await count("workspace_invitation_acceptances")).toBe(0);
  });

  it("records a synthetic provider acknowledgment without exposing bearer links in the production API", async () => {
    await production(true);
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ data: [{ id: "synthetic_provider_message" }] }),
    );
    const created = await create();
    expect(created.simulation).toBe(false);
    expect(created.items[0]).toMatchObject({ deliveryStatus: "sent" });
    expect(created.items[0].previewUrl).toBeUndefined();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails/batch");
    const payload = JSON.parse(String(init!.body)) as {
      to: string[];
      html: string;
    }[];
    expect(payload[0].to).toEqual(["new@example.invalid"]);
    expect(payload[0].html).toContain("/invitation/#token=");
    const row = await db
      .prepare(
        "SELECT delivery_status,provider_id,token_hash FROM workspace_invitations WHERE id=?",
      )
      .bind(created.items[0].id)
      .first();
    expect(row).toMatchObject({
      delivery_status: "sent",
      provider_id: "synthetic_provider_message",
    });
  });

  it.each(["timeout", "server", "malformed"])(
    "keeps %s delivery unknown without retrying on reads or duplicate submission",
    async (outcome) => {
      await production(true);
      if (outcome === "timeout")
        vi.mocked(fetch).mockRejectedValue(
          new Error("Synthetic network uncertainty"),
        );
      else
        vi.mocked(fetch).mockResolvedValue(
          outcome === "server"
            ? new Response("not retained", { status: 503 })
            : Response.json({ data: [] }),
        );
      const created = await create();
      expect(created.items[0]).toMatchObject({ deliveryStatus: "unknown" });
      await handleInvitationRoute(request("/api/admin/invitations"), env);
      await expect(create()).rejects.toMatchObject({
        code: "INVITATION_PENDING",
      });
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
      expect(await count("workspace_invitations")).toBe(1);
    },
  );
});
