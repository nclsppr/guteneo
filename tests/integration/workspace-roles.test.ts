import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { handleAccountRoute } from "../../apps/api/src/account";
import {
  authenticateBrowser,
  authenticateMcp,
  hashSecret,
  type AuthEnv,
} from "../../apps/api/src/auth";
import { authenticateNative } from "../../apps/api/src/mobile";
import {
  DomainService,
  type ActorContext,
} from "../../packages/domain/src/index";
import type { Env } from "../../apps/api/src/env";

let mf: Miniflare, db: D1Database, domain: DomainService, env: AuthEnv;
let admin: Principal,
  supervisor: Principal,
  operator: Principal,
  observer: Principal;
let outsider: Principal;
type Principal = {
  context: ActorContext;
  cookie: string;
  csrf: string;
  browserHash: string;
};
const now = () => new Date().toISOString();
const later = () => new Date(Date.now() + 3600000).toISOString();
const random = () => crypto.randomUUID();
const email = {
  channel: "email" as const,
  recipient: { email: "fictional@example.invalid" },
  subject: "Droits d’atelier — simulation",
  html: "<p>Contenu fictif sans envoi fournisseur.</p>",
};

async function applySql(source: string) {
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
  if (statement.trim()) throw new Error("Incomplete migration");
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
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await applySql(
      await readFile(
        new URL(`../../migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
});
afterAll(async () => mf?.dispose());

async function login(context: ActorContext): Promise<Principal> {
  const token = Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64url"),
    csrf = random(),
    browserHash = await hashSecret(token);
  await db
    .prepare(
      "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,?,1,1,?,?)",
    )
    .bind(
      browserHash,
      context.userId,
      context.organizationId,
      csrf,
      now(),
      later(),
    )
    .run();
  return { context, cookie: `guteneo_session=${token}`, csrf, browserHash };
}
async function principal(
  organizationId: string,
  role: ActorContext["role"],
  permissions: {
    supervisorCanApprove?: boolean;
    supervisorCanReport?: boolean;
  } = {},
  userId = `roles_user_${random()}`,
): Promise<Principal> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO users(id,name,email,created_at) VALUES(?,'Fictional role fixture','roles@example.invalid',?)",
    )
    .bind(userId, now())
    .run();
  await db
    .prepare(
      "INSERT INTO memberships(organization_id,user_id,role,supervisor_can_approve,supervisor_can_report,created_at) VALUES(?,?,?,?,?,?)",
    )
    .bind(
      organizationId,
      userId,
      role,
      permissions.supervisorCanApprove ? 1 : 0,
      permissions.supervisorCanReport ? 1 : 0,
      now(),
    )
    .run();
  return login({
    organizationId,
    userId,
    role,
    actor: "browser",
    ...permissions,
  });
}
async function organization() {
  const id = `roles_org_${random()}`;
  await db
    .prepare(
      "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Atelier fictif','simulation',?)",
    )
    .bind(id, now())
    .run();
  await db.batch([
    db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Fictional sender','sender@example.invalid','verified','simulation',?)",
      )
      .bind(`roles_sender_${random()}`, id, now()),
    db
      .prepare(
        "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'email',?,100,10000,'EUR')",
      )
      .bind(id, now().slice(0, 7)),
    db.prepare("INSERT INTO channel_controls VALUES(?,'email',1)").bind(id),
  ]);
  return id;
}
beforeEach(async () => {
  const org = await organization();
  admin = await principal(org, "admin");
  supervisor = await principal(org, "supervisor");
  operator = await principal(org, "member");
  observer = await principal(org, "viewer");
  outsider = await principal(await organization(), "admin");
  domain = new DomainService(db, { mode: "simulation" });
  env = {
    DB: db,
    ENVIRONMENT: "local",
    MODE: "simulation",
    APP_ORIGIN: "http://localhost:8787",
  };
});
function request(path: string, user = admin, method = "GET", body?: unknown) {
  return new Request(`${env.APP_ORIGIN}${path}`, {
    method,
    headers: {
      Origin: env.APP_ORIGIN,
      Cookie: user.cookie,
      "X-CSRF-Token": user.csrf,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function count(table: string, org = admin.context.organizationId) {
  return (await db
    .prepare(`SELECT count(*) n FROM ${table} WHERE organization_id=?`)
    .bind(org)
    .first<{ n: number }>())!.n;
}
async function permissions(user: Principal, approve: boolean, report: boolean) {
  await db
    .prepare(
      "UPDATE memberships SET supervisor_can_approve=?,supervisor_can_report=? WHERE organization_id=? AND user_id=?",
    )
    .bind(
      approve ? 1 : 0,
      report ? 1 : 0,
      user.context.organizationId,
      user.context.userId,
    )
    .run();
  return {
    ...user.context,
    supervisorCanApprove: approve,
    supervisorCanReport: report,
  };
}
const prepare = (ctx = operator.context) =>
  domain.prepareDispatch(ctx, email, random());
function raceBeforeBatch(change: () => Promise<unknown>) {
  let changed = false;
  return new Proxy(db, {
    get(target, key) {
      if (key === "batch")
        return async (statements: D1PreparedStatement[]) => {
          if (!changed) {
            changed = true;
            await change();
          }
          return db.batch(statements);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("workspace roles on current D1 membership", () => {
  it("keeps preparation separate from approval, confirmation, refusal and reporting for an operator", async () => {
    const dispatch = await prepare();
    expect((await domain.listDispatches(operator.context)).items).toHaveLength(
      1,
    );
    await expect(
      domain.approveDispatch(
        operator.context,
        dispatch.id,
        dispatch.fingerprint,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await domain.approveDispatch(
      admin.context,
      dispatch.id,
      dispatch.fingerprint,
    );
    await expect(
      domain.confirmDispatch(operator.context, dispatch.id, random()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      domain.cancelDispatch(operator.context, dispatch.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(domain.usage(operator.context)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      domain.dispatchOverview(operator.context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await count("reservations")).toBe(0);
    expect(await count("outbox")).toBe(0);
  });

  it("starts supervisor approval and reporting closed, with operational preparation available", async () => {
    const dispatch = await prepare(supervisor.context);
    await expect(
      domain.approveDispatch(
        supervisor.context,
        dispatch.id,
        dispatch.fingerprint,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(domain.usage(supervisor.context)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      domain.dispatchOverview(supervisor.context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("grants supervisor approval independently of reporting and retains immutable fingerprint review", async () => {
    const ctx = await permissions(supervisor, true, false);
    const dispatch = await prepare();
    await expect(
      domain.approveDispatch(ctx, dispatch.id, "changed-fingerprint"),
    ).rejects.toMatchObject({ code: "FINGERPRINT_MISMATCH" });
    await domain.approveDispatch(ctx, dispatch.id, dispatch.fingerprint);
    expect(
      (await domain.confirmDispatch(ctx, dispatch.id, random())).status,
    ).toBe("queued");
    expect(await count("reservations")).toBe(1);
    expect(await count("outbox")).toBe(1);
    const rejected = await prepare();
    expect((await domain.cancelDispatch(ctx, rejected.id)).status).toBe(
      "cancelled",
    );
    await expect(domain.usage(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(domain.admin(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("grants supervisor reports independently of approval, without tenant leakage", async () => {
    const ctx = await permissions(supervisor, false, true);
    await prepare();
    await prepare(outsider.context);
    expect((await domain.usage(ctx)).items).toHaveLength(1);
    expect((await domain.dispatchOverview(ctx)).dispatches.total).toBe(1);
    const dispatch = await prepare();
    await expect(
      domain.approveDispatch(ctx, dispatch.id, dispatch.fingerprint),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(domain.admin(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      domain.getDispatch(outsider.context, dispatch.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets observers read workshop documents and dispatches while blocking mutations and reports", async () => {
    const doc = await domain.registerDocument(admin.context, {
      name: "Fictional.pdf",
      sha256: "a".repeat(64),
      size: 100,
      pages: 1,
      status: "ready",
      source: "import",
      storageKey: `${admin.context.organizationId}/fictional.pdf`,
    });
    const dispatch = await prepare();
    expect((await domain.getDocument(observer.context, doc.id)).id).toBe(
      doc.id,
    );
    expect(
      (await domain.getDispatch(observer.context, dispatch.id)).dispatch.id,
    ).toBe(dispatch.id);
    await expect(prepare(observer.context)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(domain.authorizeWrite(observer.context)).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    await expect(
      domain.createCampaign(observer.context, { name: "Blocked" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      domain.cancelDispatch(observer.context, dispatch.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(domain.usage(observer.context)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      domain.dispatchOverview(observer.context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects forged supervisor flags and stale rights from an existing actor context", async () => {
    const forged = {
      ...supervisor.context,
      supervisorCanApprove: true,
      supervisorCanReport: true,
    };
    const dispatch = await prepare();
    await expect(
      domain.approveDispatch(forged, dispatch.id, dispatch.fingerprint),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(domain.usage(forged)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const authorized = await permissions(supervisor, true, true);
    await permissions(supervisor, false, false);
    await expect(
      domain.approveDispatch(authorized, dispatch.id, dispatch.fingerprint),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(domain.usage(authorized)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it.each(["mcp", "native"] as const)(
    "never turns supervisor browser approval into %s consent",
    async (actor) => {
      const ctx = await permissions(supervisor, true, true);
      const dispatch = await prepare();
      await expect(
        domain.approveDispatch(
          { ...ctx, actor },
          dispatch.id,
          dispatch.fingerprint,
        ),
      ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
      expect(await count("approvals")).toBe(0);
    },
  );

  it("withdraws a supervisor approval before acceptance when current permission is removed", async () => {
    const ctx = await permissions(supervisor, true, false);
    const dispatch = await prepare();
    await domain.approveDispatch(ctx, dispatch.id, dispatch.fingerprint);
    await permissions(supervisor, false, false);
    await expect(
      domain.confirmDispatch(admin.context, dispatch.id, random()),
    ).rejects.toBeDefined();
    expect(
      (await domain.getDispatch(admin.context, dispatch.id)).dispatch.status,
    ).toBe("prepared");
    expect(await count("reservations")).toBe(0);
    expect(await count("outbox")).toBe(0);
    await domain.approveDispatch(
      admin.context,
      dispatch.id,
      dispatch.fingerprint,
    );
    expect(
      (await domain.confirmDispatch(admin.context, dispatch.id, random()))
        .status,
    ).toBe("queued");
  });

  it("requires a new review after approval rights are withdrawn then restored", async () => {
    const ctx = await permissions(supervisor, true, false);
    const dispatch = await prepare();
    await domain.approveDispatch(ctx, dispatch.id, dispatch.fingerprint);
    await permissions(supervisor, false, false);
    await permissions(supervisor, true, false);
    expect(
      (await domain.getDispatch(admin.context, dispatch.id)).approval,
    ).toBeNull();
    await expect(
      domain.confirmDispatch(ctx, dispatch.id, random()),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(await count("outbox")).toBe(0);
    await domain.approveDispatch(ctx, dispatch.id, dispatch.fingerprint);
    expect(
      (await domain.confirmDispatch(ctx, dispatch.id, random())).status,
    ).toBe("queued");
  });

  it.each(["approval", "confirmation"] as const)(
    "fences a concurrent approval-right withdrawal inside %s transaction",
    async (operation) => {
      const ctx = await permissions(supervisor, true, false);
      const dispatch = await prepare();
      if (operation === "confirmation")
        await domain.approveDispatch(ctx, dispatch.id, dispatch.fingerprint);
      const raced = new DomainService(
        raceBeforeBatch(() => permissions(supervisor, false, false)),
        { mode: "simulation" },
      );
      await expect(
        operation === "approval"
          ? raced.approveDispatch(ctx, dispatch.id, dispatch.fingerprint)
          : raced.confirmDispatch(ctx, dispatch.id, random()),
      ).rejects.toBeDefined();
      expect(
        (await domain.getDispatch(admin.context, dispatch.id)).dispatch.status,
      ).toBe("prepared");
      expect(await count("reservations")).toBe(0);
      expect(await count("outbox")).toBe(0);
      expect(await count("idempotency_keys")).toBe(0);
      if (operation === "approval") expect(await count("approvals")).toBe(0);
    },
  );

  it("authenticates the same current options through browser, MCP and native transports", async () => {
    await permissions(supervisor, true, false);
    const browser = await authenticateBrowser(
      request("/api/account", supervisor),
      env,
    );
    expect(browser.context).toMatchObject({
      role: "supervisor",
      supervisorCanApprove: true,
      supervisorCanReport: false,
    });
    const mcpToken = `gtn_dev_${random()}`;
    const nativeToken = Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64url");
    await db.batch([
      db
        .prepare(
          "INSERT INTO development_mcp_tokens(token_hash,user_id,organization_id,expires_at) VALUES(?,?,?,?)",
        )
        .bind(
          await hashSecret(mcpToken),
          supervisor.context.userId,
          supervisor.context.organizationId,
          later(),
        ),
      db
        .prepare(
          "INSERT INTO native_sessions(token_hash,browser_session_hash,organization_id,user_id,created_at,expires_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          await hashSecret(nativeToken),
          supervisor.browserHash,
          supervisor.context.organizationId,
          supervisor.context.userId,
          now(),
          later(),
        ),
    ]);
    const mcp = await authenticateMcp(
      new Request(`${env.APP_ORIGIN}/mcp`, {
        headers: { Authorization: `Bearer ${mcpToken}` },
      }),
      env,
    );
    expect(mcp.context).toMatchObject({
      role: "supervisor",
      supervisorCanApprove: true,
      supervisorCanReport: false,
    });
    const native = await authenticateNative(
      new Request(`${env.APP_ORIGIN}/api/mobile/v1/session`, {
        headers: { Authorization: `GuteneoNative ${nativeToken}` },
      }),
      env as Env,
    );
    expect(native.context).toMatchObject({
      role: "supervisor",
      supervisorCanApprove: true,
      supervisorCanReport: false,
    });
  });

  it("lets only administrators configure independent supervisor permissions and revokes affected access", async () => {
    const crossTenant = await principal(
      outsider.context.organizationId,
      "member",
      {},
      supervisor.context.userId,
    );
    const nativeToken = Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64url");
    await db.batch([
      db
        .prepare(
          "INSERT INTO native_sessions(token_hash,browser_session_hash,organization_id,user_id,created_at,expires_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          await hashSecret(nativeToken),
          supervisor.browserHash,
          supervisor.context.organizationId,
          supervisor.context.userId,
          now(),
          later(),
        ),
      db
        .prepare(
          "INSERT INTO development_mcp_tokens(token_hash,user_id,organization_id,expires_at) VALUES(?,?,?,?)",
        )
        .bind(
          await hashSecret(`gtn_dev_${random()}`),
          supervisor.context.userId,
          supervisor.context.organizationId,
          later(),
        ),
    ]);
    const path = `/api/admin/members/${supervisor.context.userId}`;
    await expect(
      handleAccountRoute(
        request(path, operator, "PATCH", {
          role: "supervisor",
          supervisorCanApprove: true,
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      handleAccountRoute(
        request(
          `/api/admin/members/${operator.context.userId}`,
          outsider,
          "PATCH",
          {
            role: "supervisor",
            supervisorCanApprove: true,
          },
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const result = await handleAccountRoute(
      request(path, admin, "PATCH", {
        role: "supervisor",
        supervisorCanApprove: true,
        supervisorCanReport: false,
      }),
      env,
    );
    expect(await result!.json()).toMatchObject({
      updated: true,
      sessionsRevoked: true,
    });
    await expect(
      authenticateBrowser(request("/api/account", supervisor), env),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(await count("native_sessions")).toBe(0);
    expect(await count("development_mcp_tokens")).toBe(0);
    expect(
      (await authenticateBrowser(request("/api/account", crossTenant), env))
        .context.role,
    ).toBe("member");
    const fresh = await login(supervisor.context);
    expect(
      (await authenticateBrowser(request("/api/account", fresh), env)).context,
    ).toMatchObject({ supervisorCanApprove: true, supervisorCanReport: false });
  });

  it("rejects options on other roles and preserves the last administrator", async () => {
    await expect(
      handleAccountRoute(
        request(
          `/api/admin/members/${operator.context.userId}`,
          admin,
          "PATCH",
          { role: "member", supervisorCanApprove: true },
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      handleAccountRoute(
        request(`/api/admin/members/${admin.context.userId}`, admin, "PATCH", {
          role: "supervisor",
          supervisorCanApprove: true,
          supervisorCanReport: true,
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "LAST_ADMIN_REQUIRED" });
    expect(
      (await authenticateBrowser(request("/api/account"), env)).context.role,
    ).toBe("admin");
  });
});
