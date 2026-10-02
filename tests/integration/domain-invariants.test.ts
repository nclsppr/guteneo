import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { resetFixtureMemberships } from "../helpers/reset-memberships";
import {
  DomainService,
  type ActorContext,
  type PrepareInput,
  type ProviderHook,
  simulationProvider,
} from "../../packages/domain/src/index";

let mf: Miniflare, db: D1Database, domain: DomainService;
const atelier: ActorContext = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
};
const studio: ActorContext = {
  organizationId: "org_studio",
  userId: "user_studio",
  role: "admin",
  actor: "browser",
};
const email = (overrides: Partial<PrepareInput> = {}): PrepareInput => ({
  channel: "email",
  recipient: { email: "recipient@example.invalid" },
  subject: "Lettre de démonstration",
  html: "<p>Bonjour Camille.</p>",
  ...overrides,
});
const seed = readFileSync(
  new URL("../../scripts/seed.sql", import.meta.url),
  "utf8",
);
async function prepare(id = "one", input = email(), ctx = atelier) {
  return domain.prepareDispatch(ctx, input, id);
}
async function queue(id = "one", input = email(), ctx = atelier) {
  const row = await prepare(id, input, ctx);
  await domain.approveDispatch(ctx, row.id, row.fingerprint);
  return domain.confirmDispatch(ctx, row.id, `confirm-${id}`);
}
async function count(table: string) {
  return (await db
    .prepare(`SELECT count(*) AS n FROM ${table}`)
    .first<{ n: number }>())!.n;
}

async function applySql(sql: string) {
  let statement = "",
    trigger = false;
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += line + " ";
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      await db.prepare(statement).run();
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw Error("Incomplete fixture SQL");
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch(){ return new Response("ok") } }',
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const migrations = new URL("../../migrations/", import.meta.url);
  for (const filename of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await applySql(readFileSync(new URL(filename, migrations), "utf8"));
}, 30_000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  // Child-first cleanup restores the same schema/guards before reinstalling fictional tenants.
  for (const table of [
    "provider_events",
    "attempts",
    "outbox",
    "reservations",
    "approvals",
    "idempotency_keys",
    "audit_log",
    "dispatches",
    "campaigns",
    "documents",
    "suppressions",
    "senders",
    "channel_controls",
    "usage",
    "memberships",
    "users",
    "organizations",
  ])
    if (table === "memberships") await resetFixtureMemberships(db);
    else await db.prepare(`DELETE FROM ${table}`).run();
  await applySql(seed);
  domain = new DomainService(db, { mode: "simulation" });
});

describe("D1 domain invariants — actual local Workers SQLite", () => {
  it("isolates documents, dispatch detail, lists and campaigns between organizations", async () => {
    const doc = await domain.registerDocument(atelier, {
      name: "exact.pdf",
      sha256: "a".repeat(64),
      size: 100,
      pages: 1,
      status: "ready",
      source: "import",
      storageKey: "org_atelier/hash.pdf",
    });
    const dispatch = await prepare();
    const campaign = await domain.createCampaign(atelier, {
      name: "Courriers de démonstration",
    });
    await expect(domain.getDocument(studio, doc.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(domain.getDispatch(studio, dispatch.id)).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    await expect(
      domain.getCampaign(studio, campaign.id as string),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await domain.listDocuments(studio)).items).toHaveLength(0);
    expect((await domain.listDispatches(studio)).items).toHaveLength(0);
    const separate = await domain.registerDocument(studio, {
      name: "same bytes.pdf",
      sha256: "a".repeat(64),
      size: 100,
      pages: 1,
      status: "ready",
      source: "import",
      storageKey: "org_studio/hash.pdf",
    });
    expect(separate.id).not.toBe(doc.id);
  });
  it("replays preparation exactly and rejects same key with a changed recipient", async () => {
    const [a, b] = await Promise.all([prepare("same"), prepare("same")]);
    expect(a.id).toBe(b.id);
    expect(await count("dispatches")).toBe(1);
    await expect(
      prepare(
        "same",
        email({ recipient: { email: "changed@example.invalid" } }),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("does not let MCP self-approve or assert approval through confirm", async () => {
    const row = await prepare();
    await expect(
      domain.approveDispatch(
        { ...atelier, actor: "mcp" },
        row.id,
        row.fingerprint,
      ),
    ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
    await expect(
      domain.confirmDispatch(
        { ...atelier, actor: "mcp" },
        row.id,
        "without-approval",
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(await count("reservations")).toBe(0);
    expect(await count("outbox")).toBe(0);
    expect(await count("idempotency_keys")).toBe(0);
  });
  it("atomically confirms twice with a single reservation and durable outbox record", async () => {
    const row = await prepare();
    await domain.approveDispatch(atelier, row.id, row.fingerprint);
    await Promise.all([
      domain.confirmDispatch(atelier, row.id, "a"),
      domain.confirmDispatch(atelier, row.id, "b"),
    ]);
    expect(await count("reservations")).toBe(1);
    expect(await count("outbox")).toBe(1);
    const usage = (await domain.usage(atelier)).items.find(
      (r) => r.channel === "email",
    )!;
    expect(usage.reserved_count).toBe(1);
    const other = await prepare("other");
    await domain.approveDispatch(atelier, other.id, other.fingerprint);
    await expect(
      domain.confirmDispatch(atelier, other.id, "a"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await domain.getDispatch(atelier, other.id)).dispatch.status).toBe(
      "prepared",
    );
  });
  it("enforces quotas under concurrent confirmation and rolls back losing acceptance", async () => {
    await db
      .prepare(
        "UPDATE usage SET limit_count=1 WHERE organization_id='org_atelier' AND channel='email'",
      )
      .run();
    const [a, b] = await Promise.all([prepare("a"), prepare("b")]);
    await domain.approveDispatch(atelier, a.id, a.fingerprint);
    await domain.approveDispatch(atelier, b.id, b.fingerprint);
    const outcomes = await Promise.allSettled([
      domain.confirmDispatch(atelier, a.id, "a"),
      domain.confirmDispatch(atelier, b.id, "b"),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await count("outbox")).toBe(1);
    expect(await count("reservations")).toBe(1);
  });
  it("repairs commit-before-publication and tolerates duplicated queue delivery", async () => {
    const row = await queue();
    const messages: string[] = [];
    await expect(
      domain.publishOutbox(async () => {
        throw Error("broker unavailable");
      }),
    ).rejects.toThrow("broker unavailable");
    expect(
      (await db.prepare("SELECT status FROM outbox").first())!.status,
    ).toBe("pending");
    await domain.publishOutbox(async (m) => {
      messages.push(m.dispatchId);
    });
    expect(messages).toEqual([row.id]);
    let calls = 0;
    const base = simulationProvider("email");
    const hook: ProviderHook = {
      name: base.name,
      submit: async (d) => {
        calls++;
        return base.submit(d);
      },
    };
    await Promise.all([
      domain.processDispatch(row.id, hook),
      domain.processDispatch(row.id, hook),
    ]);
    expect(calls).toBe(1);
    expect(await count("attempts")).toBe(1);
    expect((await domain.getDispatch(atelier, row.id)).dispatch.status).toBe(
      "delivered",
    );
  });
  it("retains quota and prohibits blind retries after a lost provider response", async () => {
    const row = await queue();
    let calls = 0;
    const provider: ProviderHook = {
      name: "simulation:email",
      submit: async () => {
        calls++;
        throw Error("connection lost after send");
      },
    };
    await domain.processDispatch(row.id, provider);
    await domain.processDispatch(row.id, provider);
    const state = (await domain.getDispatch(atelier, row.id)).dispatch;
    expect(state.status).toBe("submission_unknown");
    expect(calls).toBe(1);
    const usage = (await domain.usage(atelier)).items.find(
      (r) => r.channel === "email",
    )!;
    expect(usage.reserved_count).toBe(1);
    expect(usage.reserved_minor).toBe(state.ceiling_minor);
    await expect(domain.cancelDispatch(atelier, row.id)).rejects.toMatchObject({
      code: "CANCELLATION_TOO_LATE",
    });
  });
  it("stores orphan callbacks, reconciles early arrivals, deduplicates, and never regresses", async () => {
    const row = await queue();
    const occurredAt = new Date().toISOString();
    expect(
      await domain.ingestEvent({
        provider: "simulation:email",
        providerId: "early-remote",
        eventId: "early",
        kind: "delivered",
        occurredAt,
      }),
    ).toMatchObject({ orphan: true });
    await domain.processDispatch(row.id, {
      name: "simulation:email",
      submit: async () => ({ status: "accepted", providerId: "early-remote" }),
    });
    expect((await domain.getDispatch(atelier, row.id)).dispatch.status).toBe(
      "delivered",
    );
    await domain.ingestEvent({
      provider: "simulation:email",
      providerId: "early-remote",
      eventId: "older",
      kind: "accepted",
      occurredAt: "2026-01-01T00:00:00Z",
    });
    expect((await domain.getDispatch(atelier, row.id)).dispatch.status).toBe(
      "delivered",
    );
    expect(
      await domain.ingestEvent({
        provider: "simulation:email",
        providerId: "early-remote",
        eventId: "early",
        kind: "delivered",
        occurredAt,
      }),
    ).toMatchObject({ duplicate: true });
    await domain.ingestEvent({
      provider: "simulation:email",
      providerId: "early-remote",
      eventId: "late-complaint",
      kind: "complained",
      occurredAt,
    });
    expect((await domain.getDispatch(atelier, row.id)).dispatch.status).toBe(
      "complained",
    );
    await expect(prepare("blocked")).rejects.toMatchObject({
      code: "RECIPIENT_SUPPRESSED",
    });
    await expect(prepare("other-org", email(), studio)).resolves.toBeTruthy();
  });
  it.each(["fax", "email"] as const)(
    "preserves confirmed delivery priority over reordered failures for %s",
    async (channel) => {
      const document = await domain.registerDocument(atelier, {
        name: "status-fixture.pdf",
        sha256: "e".repeat(64),
        size: 100,
        pages: 1,
        status: "ready",
        source: "import",
        storageKey: "org_atelier/status-fixture.pdf",
      });
      const input: PrepareInput =
        channel === "fax"
          ? {
              channel,
              documentId: document.id,
              recipient: { phone: "+33123456789" },
            }
          : email();
      for (const order of [
        ["failed", "delivered"],
        ["delivered", "failed"],
      ] as const) {
        const row = await queue(`${channel}-${order[0]}`, input);
        const provider = `simulation:${channel}`;
        await domain.processDispatch(row.id, {
          name: provider,
          submit: async () => ({ status: "accepted", providerId: row.id }),
        });
        for (const kind of order)
          await domain.ingestEvent({
            provider,
            providerId: row.id,
            eventId: `${row.id}-${kind}`,
            kind,
            occurredAt: new Date().toISOString(),
          });
        expect(
          (await domain.getDispatch(atelier, row.id)).dispatch.status,
        ).toBe("delivered");
      }
    },
  );
  it("rejects invalid event shapes before storage and never assigns another provider callback", async () => {
    await expect(
      domain.ingestEvent({
        provider: "simulation:email",
        eventId: "bad",
        kind: "accepted",
        occurredAt: "invalid",
      }),
    ).rejects.toMatchObject({ code: "INVALID_EVENT" });
    expect(await count("provider_events")).toBe(0);
    const row = await queue();
    await domain.processDispatch(row.id, simulationProvider("email"));
    await domain.ingestEvent({
      provider: "different-provider",
      providerId: `sim_${row.id}`,
      dispatchId: row.id,
      eventId: "forged-correlation",
      kind: "complained",
      occurredAt: new Date().toISOString(),
    });
    expect((await domain.getDispatch(atelier, row.id)).dispatch.status).toBe(
      "delivered",
    );
  });
  it("locks immutable approved fields in SQL and freezes campaign recipient membership", async () => {
    const campaign = await domain.createCampaign(atelier, {
      name: "Campagne immuable",
    });
    const campaignId = campaign.id as string;
    const first = await prepare("first", email({ campaignId }));
    const second = await prepare(
      "second",
      email({ campaignId, recipient: { email: "second@example.invalid" } }),
    );
    await domain.approveDispatch(atelier, first.id, first.fingerprint);
    await expect(
      db
        .prepare("UPDATE dispatches SET recipient_json=? WHERE id=?")
        .bind('{"email":"changed@example.invalid"}', first.id)
        .run(),
    ).rejects.toThrow("immutable_dispatch");
    await expect(
      db
        .prepare("UPDATE dispatches SET ceiling_minor=200 WHERE id=?")
        .bind(first.id)
        .run(),
    ).rejects.toThrow("immutable_dispatch");
    await expect(prepare("third", email({ campaignId }))).rejects.toMatchObject(
      { code: "CAMPAIGN_FROZEN" },
    );
    await domain.approveDispatch(atelier, second.id, second.fingerprint);
    expect(
      (await domain.getCampaign(atelier, campaignId)).dispatches,
    ).toHaveLength(2);
  });
  it("cancels only before submission and releases exactly one reservation", async () => {
    const row = await queue();
    await Promise.all([
      domain.cancelDispatch(atelier, row.id),
      domain.cancelDispatch(atelier, row.id),
    ]);
    expect(
      (await domain.usage(atelier)).items.find((r) => r.channel === "email")!
        .reserved_count,
    ).toBe(0);
    const calls: string[] = [];
    await domain.processDispatch(row.id, {
      name: "simulation:email",
      submit: async (d) => {
        calls.push(d.id);
        return { status: "accepted", providerId: "should-not-send" };
      },
    });
    expect(calls).toHaveLength(0);
  });
  it("checks approval expiry and fingerprint before quota changes", async () => {
    const row = await prepare();
    await expect(
      domain.approveDispatch(atelier, row.id, "different"),
    ).rejects.toMatchObject({ code: "FINGERPRINT_MISMATCH" });
    await domain.approveDispatch(atelier, row.id, row.fingerprint);
    await db
      .prepare("UPDATE approvals SET expires_at='2000-01-01T00:00:00.000Z'")
      .run();
    await expect(
      domain.confirmDispatch(atelier, row.id, "expired"),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(await count("outbox")).toBe(0);
  });
  it("checks suppression and emergency stop again immediately before submission", async () => {
    const row = await queue();
    await domain.suppressRecipient(
      atelier,
      "recipient@example.invalid",
      "unsubscribe",
    );
    let calls = 0;
    await domain.processDispatch(row.id, {
      name: "simulation:email",
      submit: async () => {
        calls++;
        return { status: "accepted", providerId: "bad" };
      },
    });
    expect(calls).toBe(0);
    expect((await domain.getDispatch(atelier, row.id)).dispatch.status).toBe(
      "failed",
    );
    expect(
      (await domain.usage(atelier)).items.find((r) => r.channel === "email")!
        .reserved_count,
    ).toBe(0);
  });
  it("turns an expired processing lease into uncertainty without releasing or resubmitting", async () => {
    const row = await queue();
    await db
      .prepare(
        "UPDATE dispatches SET status='submitting',lease_until='2000-01-01T00:00:00.000Z' WHERE id=?",
      )
      .bind(row.id)
      .run();
    expect(await domain.reconcileExpiredLeases()).toEqual({ uncertain: 1 });
    expect((await domain.getDispatch(atelier, row.id)).dispatch.status).toBe(
      "submission_unknown",
    );
    expect(
      (await domain.usage(atelier)).items.find((r) => r.channel === "email")!
        .reserved_count,
    ).toBe(1);
  });
  it("removes hostile HTML before the immutable fingerprint and rejects header injection", async () => {
    const row = await prepare(
      "sanitized",
      email({
        html: '<script>fetch("https://evil.invalid")</script><p onclick="steal()">Visible</p><img src="http://169.254.169.254/">',
      }),
    );
    expect(row.html).toBe("<p>Visible</p>");
    expect(row.text).toBe("Visible");
    await expect(
      prepare(
        "injected",
        email({ subject: "Hello\r\nBcc: victim@example.invalid" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_HEADER" });
  });
  it("retains a known reference after uncertain submission and reconciles an earlier fact", async () => {
    const row = await queue();
    await domain.ingestEvent({
      provider: "simulation:email",
      eventId: "before-timeout",
      providerId: "known-resource",
      kind: "delivered",
      occurredAt: new Date().toISOString(),
    });
    await domain.processDispatch(row.id, {
      name: "simulation:email",
      submit: async () => ({
        status: "submission_unknown",
        providerId: "known-resource",
        errorCode: "TIMEOUT_AFTER_CREATE",
      }),
    });
    const detail = await domain.getDispatch(atelier, row.id);
    expect(detail.dispatch.provider_id).toBe("known-resource");
    expect(detail.dispatch.status).toBe("delivered");
    expect(
      (await domain.usage(atelier)).items.find((r) => r.channel === "email")!
        .reserved_count,
    ).toBe(0);
  });
  it("never overwrites the reference bound by an early callback with a conflicting response", async () => {
    const row = await queue();
    await domain.processDispatch(row.id, {
      name: "simulation:email",
      submit: async () => {
        await domain.ingestEvent({
          provider: "simulation:email",
          eventId: "early-bind",
          providerId: "correct-resource",
          dispatchId: row.id,
          kind: "delivered",
          occurredAt: new Date().toISOString(),
        });
        return { status: "accepted", providerId: "conflicting-resource" };
      },
    });
    const detail = await domain.getDispatch(atelier, row.id);
    expect(detail.dispatch.provider_id).toBe("correct-resource");
    expect(detail.dispatch.status).toBe("delivered");
    expect(
      await db
        .prepare(
          "SELECT action FROM audit_log WHERE action='provider.reference_conflict'",
        )
        .first(),
    ).toBeTruthy();
  });
  it("does not permanently suppress soft bounces; permanent bounces do suppress only their tenant", async () => {
    const row = await queue();
    await domain.processDispatch(row.id, {
      name: "simulation:email",
      submit: async () => ({
        status: "accepted",
        providerId: "bounce-resource",
      }),
    });
    await domain.ingestEvent({
      provider: "simulation:email",
      eventId: "soft-bounce",
      providerId: "bounce-resource",
      kind: "bounced",
      occurredAt: new Date().toISOString(),
      payload: { bounceType: "Transient" },
    });
    await expect(prepare("after-soft")).resolves.toBeTruthy();
    await domain.ingestEvent({
      provider: "simulation:email",
      eventId: "hard-bounce",
      providerId: "bounce-resource",
      kind: "bounced",
      occurredAt: new Date().toISOString(),
      payload: { bounceType: "Permanent" },
    });
    await expect(prepare("after-hard")).rejects.toMatchObject({
      code: "RECIPIENT_SUPPRESSED",
    });
    await expect(prepare("another-org", email(), studio)).resolves.toBeTruthy();
  });
  it("rechecks revoked senders and quarantined documents before any provider call", async () => {
    const doc = await domain.registerDocument(atelier, {
      name: "test.pdf",
      sha256: "b".repeat(64),
      size: 10,
      pages: 1,
      status: "ready",
      source: "import",
      storageKey: "test.pdf",
    });
    const row = await queue("doc", email({ documentId: doc.id }));
    await db
      .prepare("UPDATE documents SET status='quarantined' WHERE id=?")
      .bind(doc.id)
      .run();
    let calls = 0;
    const hook: ProviderHook = {
      name: "simulation:email",
      submit: async () => {
        calls++;
        return { status: "accepted", providerId: "impossible" };
      },
    };
    await domain.processDispatch(row.id, hook);
    expect(calls).toBe(0);
    const second = await queue("sender");
    await db
      .prepare("UPDATE senders SET status='disabled' WHERE id=?")
      .bind(second.sender_id)
      .run();
    await domain.processDispatch(second.id, hook);
    expect(calls).toBe(0);
  });
  it("stores unparsed production files in quarantine and promotes only after trusted scan and validation", async () => {
    await db
      .prepare(
        "UPDATE organizations SET mode='production' WHERE id='org_atelier'",
      )
      .run();
    const production = new DomainService(db, { mode: "production" });
    const input = {
      name: "untrusted.pdf",
      sha256: "c".repeat(64),
      size: 12,
      pages: 0,
      status: "quarantined" as const,
      source: "import" as const,
      storageKey: "original-private-key",
    };
    const first = await production.registerDocument(atelier, input);
    expect(first.pages).toBe(0);
    expect(first.status).toBe("quarantined");
    await expect(
      production.registerDocument(atelier, {
        ...input,
        status: "ready",
        pages: 1,
      }),
    ).rejects.toMatchObject({ code: "SCAN_REQUIRED" });
    const promoted = await production.registerDocument(atelier, {
      ...input,
      status: "ready",
      pages: 2,
      scanVerified: true,
      storageKey: "redundant-upload-key",
    });
    expect(promoted.id).toBe(first.id);
    expect(promoted.pages).toBe(2);
    expect(promoted.status).toBe("ready");
    expect(promoted.storage_key).toBe("original-private-key");
    await expect(
      db
        .prepare("UPDATE documents SET pages=3 WHERE id=?")
        .bind(first.id)
        .run(),
    ).rejects.toThrow("immutable_document");
  });
  it("rejects a forged organization role even when the user has a real membership", async () => {
    await db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_atelier','user_studio','admin',?)",
      )
      .bind(new Date().toISOString())
      .run();
    await db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id='org_atelier' AND user_id='user_atelier'",
      )
      .run();
    await expect(prepare()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("counts and filters dispatch groups beyond one page without leaking tenants", async () => {
    await domain.registerDocument(atelier, {
      name: "overview.pdf",
      sha256: "b".repeat(64),
      size: 100,
      pages: 1,
      status: "ready",
      source: "import",
      storageKey: "org_atelier/overview.pdf",
    });
    for (const id of ["a", "b", "c"]) await prepare(id);
    const uncertain = await queue("q");
    const cancelled = await prepare("x");
    await domain.cancelDispatch(atelier, cancelled.id);
    await db
      .prepare(
        "UPDATE dispatches SET status='submission_unknown' WHERE organization_id='org_atelier' AND id=?",
      )
      .bind(uncertain.id)
      .run();
    await prepare("other", email(), studio);

    expect(await domain.dispatchOverview(atelier)).toEqual({
      documents: 1,
      dispatches: {
        total: 5,
        approval: 3,
        in_progress: 0,
        attention: 1,
        done: 1,
      },
    });
    const first = await domain.listDispatches(
      atelier,
      undefined,
      2,
      "approval",
    );
    expect(first.items.map((row) => row.status)).toEqual([
      "prepared",
      "prepared",
    ]);
    expect(first.nextCursor).toBeTruthy();
    const rest = await domain.listDispatches(
      atelier,
      first.nextCursor!,
      2,
      "approval",
    );
    expect(rest.items).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();
    expect(
      (
        await domain.listDispatches(atelier, undefined, 30, "attention")
      ).items.map((row) => row.id),
    ).toEqual([uncertain.id]);
    expect(
      (await domain.listDispatches(atelier, undefined, 30, "done")).items.map(
        (row) => row.id,
      ),
    ).toEqual([cancelled.id]);

    expect(await domain.dispatchOverview(studio)).toEqual({
      documents: 0,
      dispatches: {
        total: 1,
        approval: 1,
        in_progress: 0,
        attention: 0,
        done: 0,
      },
    });
    expect(
      (await domain.listDispatches(studio, undefined, 30, "attention")).items,
    ).toHaveLength(0);
    await expect(
      domain.listDispatches(atelier, undefined, 30, "prepared') OR 1=1 --"),
    ).rejects.toMatchObject({ code: "INVALID_GROUP" });
  });
  it("paginates deterministically and forbids production simulation pricing", async () => {
    await prepare("a");
    await prepare("b");
    await prepare("c");
    const page = await domain.listDispatches(atelier, undefined, 2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
    const rest = await domain.listDispatches(atelier, page.nextCursor!, 2);
    expect(rest.items).toHaveLength(1);
    expect(rest.items.some((r) => page.items.some((p) => p.id === r.id))).toBe(
      false,
    );
    await db
      .prepare(
        "UPDATE organizations SET mode='production' WHERE id='org_atelier'",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES('prod_sender','org_atelier','email','Verified test fixture','test@example.invalid','verified','production','2026-01-01T00:00:00Z')",
      )
      .run();
    await expect(
      new DomainService(db, { mode: "production" }).prepareDispatch(
        atelier,
        email(),
        "live",
      ),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
  });
});
