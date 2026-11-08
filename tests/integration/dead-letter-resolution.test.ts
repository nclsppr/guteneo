import worker from "../../apps/api/src/index";
import {
  createSession,
  hashSecret,
  memberships,
} from "../../apps/api/src/auth";
import { authenticateNative } from "../../apps/api/src/mobile";
import type { Env } from "../../apps/api/src/env";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { setBrowserChannelControl } from "../../apps/api/src/browser-administrator";
import { DeadLetterService } from "../../apps/api/src/dead-letters";
import {
  DomainService,
  type ActorContext,
} from "../../packages/domain/src/index";
import { migratedD1 } from "../helpers/migrated-d1";

let fixture: Awaited<ReturnType<typeof migratedD1>>;
let db: D1Database;
let domain: DomainService;
const secret = "a".repeat(64);
const administrator: ActorContext = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
  documentSessionHash: secret,
};
beforeAll(async () => {
  fixture = await migratedD1("dead-letter-resolution");
  db = fixture.db;
  const seed = (
    await readFile(new URL("../../scripts/seed.sql", import.meta.url), "utf8")
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  await db.batch(
    seed
      .split(";")
      .filter((statement) => statement.trim())
      .map((statement) => db.prepare(statement)),
  );
  await db
    .prepare(
      "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,'fixture',0,1,?,?)",
    )
    .bind(
      secret,
      administrator.userId,
      administrator.organizationId,
      new Date().toISOString(),
      new Date(Date.now() + 3600000).toISOString(),
    )
    .run();
  domain = new DomainService(db, { mode: "simulation" });
}, 30000);
afterAll(async () => {
  await fixture?.mf.dispose();
});
async function incident(cancelled = true) {
  const dispatch = await domain.prepareDispatch(
    administrator,
    {
      channel: "email",
      recipient: { email: "recipient@example.invalid" },
      subject: "Synthetic",
      text: "Synthetic fixture",
    },
    crypto.randomUUID(),
  );
  if (cancelled) await domain.cancelDispatch(administrator, dispatch.id);
  const id = `dead_${crypto.randomUUID()}`;
  await db
    .prepare(
      "INSERT INTO dead_letters(id,dispatch_id,queue,received_at) VALUES(?,?,'interactive',?)",
    )
    .bind(id, dispatch.id, new Date().toISOString())
    .run();
  return { id, dispatch };
}
async function receipts(id: string) {
  return db
    .prepare(
      "SELECT id,created_at FROM audit_log WHERE organization_id=? AND resource_id=? AND action='dead_letter.resolved'",
    )
    .bind(administrator.organizationId, id)
    .all();
}

describe("browser-admin dead-letter resolution through current D1 authority", () => {
  it("resolves a closed original once without changing dispatches, holds or outbox", async () => {
    const { id, dispatch } = await incident();
    const before = await db
      .prepare("SELECT * FROM dispatches WHERE id=?")
      .bind(dispatch.id)
      .first();
    const service = new DeadLetterService(domain);
    const [first, second] = await Promise.all([
      service.resolve(administrator, id),
      service.resolve(administrator, id),
    ]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ id, dispatchId: dispatch.id });
    expect((await receipts(id)).results).toHaveLength(1);
    expect(await service.resolve(administrator, id)).toEqual(first);
    expect(
      await db
        .prepare("SELECT * FROM dispatches WHERE id=?")
        .bind(dispatch.id)
        .first(),
    ).toEqual(before);
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM outbox WHERE dispatch_id=?")
        .bind(dispatch.id)
        .first(),
    ).toEqual({ n: 0 });
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM reservations WHERE dispatch_id=?")
        .bind(dispatch.id)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("refuses unfinished execution without recording a resolution", async () => {
    const { id } = await incident(false);
    await expect(
      new DeadLetterService(domain).resolve(administrator, id),
    ).rejects.toMatchObject({ code: "INCIDENT_STILL_OPEN", status: 409 });
    expect((await receipts(id)).results).toHaveLength(0);
    expect(
      await db
        .prepare("SELECT resolved_at FROM dead_letters WHERE id=?")
        .bind(id)
        .first(),
    ).toEqual({ resolved_at: null });
  });
  it("keeps cross-workspace identifiers absent", async () => {
    const { id } = await incident();
    const other: ActorContext = {
      ...administrator,
      organizationId: "org_studio",
      userId: "user_studio",
    };
    await expect(
      new DeadLetterService(domain).resolve(other, id),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect((await receipts(id)).results).toHaveLength(0);
  });
  it.each(["mcp", "native", "system"] as const)(
    "refuses %s actor even with an administrator snapshot",
    async (actor) => {
      const { id } = await incident();
      await expect(
        new DeadLetterService(domain).resolve({ ...administrator, actor }, id),
      ).rejects.toMatchObject({ code: "ADMIN_REQUIRED", status: 403 });
    },
  );
  it("rechecks the browser credential after the eligibility read", async () => {
    const { id } = await incident();
    const expiredHash = "b".repeat(64);
    await db
      .prepare(
        "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,'fixture',0,1,?,?)",
      )
      .bind(
        expiredHash,
        administrator.userId,
        administrator.organizationId,
        new Date().toISOString(),
        new Date(Date.now() + 3600000).toISOString(),
      )
      .run();
    const wrapped = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        await db
          .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
          .bind(expiredHash)
          .run();
        return db.batch(statements);
      },
    } as unknown as D1Database;
    const service = new DeadLetterService(
      new DomainService(wrapped, { mode: "simulation" }),
    );
    await expect(
      service.resolve(
        { ...administrator, documentSessionHash: expiredHash },
        id,
      ),
    ).rejects.toMatchObject({
      code: "INCIDENT_RESOLUTION_CHANGED",
      status: 409,
    });
    expect((await receipts(id)).results).toHaveLength(0);
    expect(
      await db
        .prepare("SELECT resolved_at FROM dead_letters WHERE id=?")
        .bind(id)
        .first(),
    ).toEqual({ resolved_at: null });
  });
  it("rejects direct resolution without its audit receipt and retains resolved identity", async () => {
    const { id } = await incident();
    await expect(
      db
        .prepare("UPDATE dead_letters SET resolved_at=? WHERE id=?")
        .bind(new Date().toISOString(), id)
        .run(),
    ).rejects.toThrow("dead_letter_resolution_receipt_required");
    const resolved = await new DeadLetterService(domain).resolve(
      administrator,
      id,
    );
    await expect(
      db
        .prepare("UPDATE dead_letters SET resolved_at=NULL WHERE id=?")
        .bind(id)
        .run(),
    ).rejects.toThrow("dead_letter_resolution_immutable");
    await expect(
      db
        .prepare("UPDATE dead_letters SET dispatch_id=NULL WHERE id=?")
        .bind(id)
        .run(),
    ).rejects.toThrow("dead_letter_identity_immutable");
    expect(
      await new DeadLetterService(domain).resolve(administrator, id),
    ).toEqual(resolved);
  });
  it("rolls back the resolution receipt when its final state write fails", async () => {
    const { id } = await incident();
    await db
      .prepare(
        `CREATE TRIGGER reject_resolution BEFORE UPDATE OF resolved_at ON dead_letters WHEN NEW.id='${id}' BEGIN SELECT RAISE(ABORT,'synthetic_resolution_failure'); END`,
      )
      .run();
    try {
      await expect(
        new DeadLetterService(domain).resolve(administrator, id),
      ).rejects.toThrow();
      expect((await receipts(id)).results).toHaveLength(0);
      expect(
        await db
          .prepare("SELECT resolved_at FROM dead_letters WHERE id=?")
          .bind(id)
          .first(),
      ).toEqual({ resolved_at: null });
    } finally {
      await db.prepare("DROP TRIGGER reject_resolution").run();
    }
  });
  it("keeps resolution and its receipt paired when the credential expires after the transaction's authority decision", async () => {
    const { id } = await incident();
    await db
      .prepare(
        `CREATE TRIGGER expire_after_resolution_receipt AFTER INSERT ON audit_log WHEN NEW.action='dead_letter.resolved' AND NEW.resource_id='${id}' BEGIN UPDATE browser_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash='${secret}'; END`,
      )
      .run();
    try {
      // Deterministic expiry boundary inside the accepted first statement; no wall-clock wait.
      await expect(
        new DeadLetterService(domain).resolve(administrator, id),
      ).rejects.toMatchObject({ code: "INCIDENT_RESOLUTION_CHANGED" });
      const recorded = await receipts(id);
      expect(recorded.results).toHaveLength(1);
      expect(
        await db
          .prepare("SELECT resolved_at FROM dead_letters WHERE id=?")
          .bind(id)
          .first(),
      ).toEqual({ resolved_at: recorded.results[0].created_at });
    } finally {
      await db.prepare("DROP TRIGGER expire_after_resolution_receipt").run();
      await db
        .prepare("UPDATE browser_sessions SET expires_at=? WHERE token_hash=?")
        .bind(new Date(Date.now() + 3600000).toISOString(), secret)
        .run();
    }
  });
  it("writes neither resolution nor receipt when the credential expires before the transaction's first statement", async () => {
    const { id } = await incident();
    const wrapped = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        await db
          .prepare(
            "UPDATE browser_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?",
          )
          .bind(secret)
          .run();
        return db.batch(statements);
      },
    } as unknown as D1Database;
    try {
      await expect(
        new DeadLetterService(
          new DomainService(wrapped, { mode: "simulation" }),
        ).resolve(administrator, id),
      ).rejects.toMatchObject({ code: "INCIDENT_RESOLUTION_CHANGED" });
      expect((await receipts(id)).results).toHaveLength(0);
      expect(
        await db
          .prepare("SELECT resolved_at FROM dead_letters WHERE id=?")
          .bind(id)
          .first(),
      ).toEqual({ resolved_at: null });
    } finally {
      await db
        .prepare("UPDATE browser_sessions SET expires_at=? WHERE token_hash=?")
        .bind(new Date(Date.now() + 3600000).toISOString(), secret)
        .run();
    }
  });
});

describe("channel controls bind the final browser administrator", () => {
  async function operator(role: "admin" | "viewer" = "admin") {
    const suffix = crypto.randomUUID();
    const token = (await import("../../packages/domain/src/index")).sha256(
      suffix,
    );
    const hash = await token;
    const ctx: ActorContext = {
      organizationId: `org_${suffix}`,
      userId: `user_${suffix}`,
      role: "admin",
      actor: "browser",
      documentSessionHash: hash,
    };
    const at = new Date().toISOString();
    await db.batch([
      db
        .prepare(
          "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Synthetic','simulation',?)",
        )
        .bind(ctx.organizationId, at),
      db
        .prepare(
          "INSERT INTO users(id,name,email,created_at) VALUES(?,'Synthetic','operator@example.invalid',?)",
        )
        .bind(ctx.userId, at),
      db
        .prepare(
          "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,?,?)",
        )
        .bind(ctx.organizationId, ctx.userId, role, at),
      db
        .prepare(
          "INSERT INTO channel_controls(organization_id,channel,enabled) VALUES(?,'email',0)",
        )
        .bind(ctx.organizationId),
      db
        .prepare(
          "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,'synthetic',0,1,?,?)",
        )
        .bind(
          hash,
          ctx.userId,
          ctx.organizationId,
          at,
          new Date(Date.now() + 3600000).toISOString(),
        ),
    ]);
    return ctx;
  }
  it("commits the control and its audit together with no dispatch/outbox effect", async () => {
    const ctx = await operator();
    expect(
      await setBrowserChannelControl(db, ctx, "simulation", "email", true),
    ).toEqual({ channel: "email", enabled: true });
    expect(
      await db
        .prepare(
          "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel='email'",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ enabled: 1 });
    expect(
      (
        await db
          .prepare(
            "SELECT action,details_json FROM audit_log WHERE organization_id=?",
          )
          .bind(ctx.organizationId)
          .all()
      ).results,
    ).toEqual([
      { action: "channel.control", details_json: '{"enabled":true}' },
    ]);
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM dispatches WHERE organization_id=?")
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ n: 0 });
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM outbox WHERE organization_id=?")
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("rejects a cached admin snapshot after role revocation", async () => {
    const ctx = await operator("viewer");
    await expect(
      setBrowserChannelControl(db, ctx, "simulation", "email", true),
    ).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
    expect(
      await db
        .prepare("SELECT enabled FROM channel_controls WHERE organization_id=?")
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ enabled: 0 });
    expect(
      (
        await db
          .prepare("SELECT id FROM audit_log WHERE organization_id=?")
          .bind(ctx.organizationId)
          .all()
      ).results,
    ).toEqual([]);
  });
  it("rejects credential revocation immediately before the atomic mutation", async () => {
    const ctx = await operator();
    const wrapped = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        await db
          .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
          .bind(ctx.documentSessionHash!)
          .run();
        return db.batch(statements);
      },
    } as unknown as D1Database;
    await expect(
      setBrowserChannelControl(wrapped, ctx, "simulation", "email", true),
    ).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
    expect(
      await db
        .prepare("SELECT enabled FROM channel_controls WHERE organization_id=?")
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ enabled: 0 });
    expect(
      (
        await db
          .prepare("SELECT id FROM audit_log WHERE organization_id=?")
          .bind(ctx.organizationId)
          .all()
      ).results,
    ).toEqual([]);
  });
  it("pairs channel mutation and audit when the credential expires inside the accepted transaction", async () => {
    const ctx = await operator();
    await db
      .prepare(
        `CREATE TRIGGER expire_after_channel_control AFTER UPDATE ON channel_controls WHEN NEW.organization_id='${ctx.organizationId}' BEGIN UPDATE browser_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash='${ctx.documentSessionHash}'; END`,
      )
      .run();
    try {
      await expect(
        setBrowserChannelControl(db, ctx, "simulation", "email", true),
      ).resolves.toEqual({ channel: "email", enabled: true });
      expect(
        await db
          .prepare(
            "SELECT enabled FROM channel_controls WHERE organization_id=?",
          )
          .bind(ctx.organizationId)
          .first(),
      ).toEqual({ enabled: 1 });
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM audit_log WHERE organization_id=? AND action='channel.control'",
          )
          .bind(ctx.organizationId)
          .first(),
      ).toEqual({ n: 1 });
    } finally {
      await db.prepare("DROP TRIGGER expire_after_channel_control").run();
    }
  });
  it("writes neither channel control nor audit when the first statement sees an expired credential", async () => {
    const ctx = await operator();
    await db
      .prepare(
        "UPDATE browser_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?",
      )
      .bind(ctx.documentSessionHash!)
      .run();
    await expect(
      setBrowserChannelControl(db, ctx, "simulation", "email", true),
    ).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
    expect(
      await db
        .prepare("SELECT enabled FROM channel_controls WHERE organization_id=?")
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ enabled: 0 });
    expect(
      await db
        .prepare("SELECT count(*) n FROM audit_log WHERE organization_id=?")
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });
});

describe("dead-letter resolution through the actual Hono HTTP authority boundary", () => {
  it("preserves the browser credential hash, enforces CSRF and refuses valid nonbrowser credentials without sending", async () => {
    const { id, dispatch } = await incident();
    const forbidden = vi.fn(() => {
      throw new Error("Resolution attempted an external operation");
    });
    const env = {
      DB: db,
      MODE: "simulation",
      ENVIRONMENT: "local",
      APP_ORIGIN: "http://localhost:8787",
      DISPATCH_QUEUE: { send: forbidden, sendBatch: forbidden },
      BULK_QUEUE: { send: forbidden, sendBatch: forbidden },
      ASSETS: { fetch: forbidden },
    } as unknown as Env;
    const member = (await memberships(env, administrator.userId)).find(
      (value) => value.organization_id === administrator.organizationId,
    )!;
    const browser = await createSession(env, member, true, true, true);
    const cookie = browser.cookie.split(";")[0];
    const mcpToken = `gtn_dev_${crypto.randomUUID()}`;
    await db
      .prepare(
        "INSERT INTO development_mcp_tokens(token_hash,user_id,organization_id,expires_at) VALUES(?,?,?,?)",
      )
      .bind(
        await hashSecret(mcpToken),
        administrator.userId,
        administrator.organizationId,
        new Date(Date.now() + 3600000).toISOString(),
      )
      .run();
    const nativeToken = Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64url");
    await db
      .prepare(
        "INSERT INTO native_sessions(token_hash,browser_session_hash,organization_id,user_id,created_at,expires_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        await hashSecret(nativeToken),
        browser.session.tokenHash,
        administrator.organizationId,
        administrator.userId,
        new Date().toISOString(),
        new Date(Date.now() + 3600000).toISOString(),
      )
      .run();
    const native = await authenticateNative(
      new Request(`${env.APP_ORIGIN}/api/mobile/session`, {
        headers: { Authorization: `GuteneoNative ${nativeToken}` },
      }),
      env,
    );
    expect(native.context.actor).toBe("native");
    const before = await db
      .prepare("SELECT * FROM dispatches WHERE id=?")
      .bind(dispatch.id)
      .first();
    const outbound = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(forbidden);
    const post = (headers: Record<string, string>) =>
      worker.fetch(
        new Request(
          `${env.APP_ORIGIN}/api/admin/dead-letters/${id}/resolution`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: env.APP_ORIGIN,
              ...headers,
            },
            body: JSON.stringify({ confirmed: true }),
          },
        ),
        env,
      );
    try {
      for (const csrf of [undefined, "incorrect"]) {
        const response = await post({
          Cookie: cookie,
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
          error: { code: "CSRF_REJECTED" },
        });
      }
      const bearer = await post({ Authorization: `Bearer ${mcpToken}` });
      expect(bearer.status).toBe(403);
      expect(await bearer.json()).toMatchObject({
        error: { code: "ADMIN_REQUIRED" },
      });
      const nativeResponse = await post({
        Authorization: `GuteneoNative ${nativeToken}`,
      });
      expect(nativeResponse.status).toBe(401);
      expect((await receipts(id)).results).toHaveLength(0);
      expect(
        await db
          .prepare("SELECT resolved_at FROM dead_letters WHERE id=?")
          .bind(id)
          .first(),
      ).toEqual({ resolved_at: null });
      const resolved = await post({
        Cookie: cookie,
        "X-CSRF-Token": browser.session.csrfToken,
      });
      expect(resolved.status).toBe(200);
      expect(await resolved.json()).toMatchObject({
        id,
        dispatchId: dispatch.id,
        resolvedAt: expect.any(String),
      });
      expect((await receipts(id)).results).toHaveLength(1);
      expect(
        await db
          .prepare("SELECT * FROM dispatches WHERE id=?")
          .bind(dispatch.id)
          .first(),
      ).toEqual(before);
      expect(
        await db
          .prepare("SELECT count(*) n FROM attempts WHERE dispatch_id=?")
          .bind(dispatch.id)
          .first(),
      ).toEqual({ n: 0 });
      expect(
        await db
          .prepare("SELECT count(*) n FROM outbox WHERE dispatch_id=?")
          .bind(dispatch.id)
          .first(),
      ).toEqual({ n: 0 });
      expect(
        await db
          .prepare("SELECT count(*) n FROM reservations WHERE dispatch_id=?")
          .bind(dispatch.id)
          .first(),
      ).toEqual({ n: 0 });
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      outbound.mockRestore();
    }
  });
});
