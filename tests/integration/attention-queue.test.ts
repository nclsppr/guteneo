import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DomainService,
  sha256,
  type ActorContext,
} from "../../packages/domain/src/index";
import { DispatchScheduleService } from "../../apps/api/src/dispatch-schedules";
import { migratedD1 } from "../helpers/migrated-d1";
let fixture: Awaited<ReturnType<typeof migratedD1>>, domain: DomainService;
const ctx: ActorContext = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
};
const viewer: ActorContext = {
  ...ctx,
  userId: "attention_viewer",
  role: "viewer",
};
const other: ActorContext = {
  ...ctx,
  organizationId: "org_studio",
  userId: "user_studio",
};
beforeAll(async () => {
  fixture = await migratedD1("attention-queue");
  for (const sql of readFileSync(
    new URL("../../scripts/seed.sql", import.meta.url),
    "utf8",
  )
    .replace(/^--.*$/gm, "")
    .split(";")
    .filter((x) => x.trim()))
    await fixture.db.prepare(sql).run();
  const now = new Date().toISOString();
  await fixture.db
    .prepare(
      "INSERT INTO users(id,name,email,created_at) VALUES('attention_viewer','Synthetic viewer','viewer@example.invalid',?)",
    )
    .bind(now)
    .run();
  await fixture.db
    .prepare(
      "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,'attention_viewer','viewer',?)",
    )
    .bind(ctx.organizationId, now)
    .run();
  domain = new DomainService(fixture.db, { mode: "simulation" });
});
afterAll(async () => {
  await fixture?.mf.dispose();
});
describe("SQL-backed metadata attention queue", () => {
  it("paginates every eligible row beyond the ordinary first dispatch page", async () => {
    for (let i = 0; i < 35; i++)
      await domain.prepareDispatch(
        ctx,
        {
          channel: "email",
          recipient: { email: `fictional-${i}@example.invalid` },
          subject: "Private fixture title",
          text: "Private fixture content",
        },
        crypto.randomUUID(),
      );
    const first = await domain.attentionQueue(ctx, undefined, 30);
    expect(first.items).toHaveLength(30);
    expect(first.nextCursor).toBeTruthy();
    const next = await domain.attentionQueue(ctx, first.nextCursor!, 30);
    expect(next.items).toHaveLength(5);
    expect(next.nextCursor).toBeNull();
    expect(new Set([...first.items, ...next.items].map((x) => x.id)).size).toBe(
      35,
    );
    const text = JSON.stringify(first);
    expect(text).not.toContain("example.invalid");
    expect(text).not.toContain("Private fixture");
    expect((await domain.attentionQueue(other)).items).toEqual([]);
    expect((await domain.attentionQueue(viewer)).items).toEqual([]);
    await expect(
      domain.attentionQueue({ ...ctx, actor: "mcp" }),
    ).rejects.toMatchObject({ code: "BROWSER_REQUIRED" });
  });
  it("prioritizes reconciliation and blocked schedules without publishing private source metadata to viewers", async () => {
    const source = await domain.prepareDispatch(
      ctx,
      {
        channel: "email",
        recipient: { email: "unknown@example.invalid" },
        subject: "Synthetic uncertainty",
        text: "Synthetic",
      },
      crypto.randomUUID(),
    );
    await domain.approveDispatch(ctx, source.id, source.fingerprint);
    await domain.confirmDispatch(ctx, source.id, crypto.randomUUID());
    await domain.processDispatch(source.id, {
      name: "simulation:email",
      submit: async () => ({
        status: "submission_unknown",
        errorCode: "SYNTHETIC_UNKNOWN",
      }),
    });
    const doc = await domain.registerDocument(ctx, {
      name: "Private source",
      sha256: await sha256("attention private"),
      size: 20,
      pages: 1,
      status: "ready",
      source: "import",
      storageKey: "synthetic/private",
      privateToCreator: true,
    });
    const fax = await domain.prepareDispatch(
      ctx,
      {
        channel: "fax",
        documentId: doc.id,
        recipient: { phone: "+35242123456" },
      },
      crypto.randomUUID(),
    );
    const schedules = new DispatchScheduleService(
      { MODE: "simulation" },
      domain,
    );
    const schedule = await schedules.create(
      ctx,
      {
        dispatchId: fax.id,
        executeAt: new Date(Date.now() + 120_000).toISOString(),
        maxTotalMinor: 100,
      },
      crypto.randomUUID(),
    );
    await fixture.db
      .prepare(
        "UPDATE dispatch_schedules SET status='blocked',revision=revision+1,error_code='SYNTHETIC_BLOCKED' WHERE id=?",
      )
      .bind(schedule.id)
      .run();
    const queue = await domain.attentionQueue(ctx, undefined, 2);
    expect(queue.items.map((x) => x.kind)).toEqual([
      "submission_unknown",
      "schedule_blocked",
    ]);
    expect(queue.items[1].route).toBe(`/app/schedules/${schedule.id}`);
    const limited = await domain.attentionQueue(viewer);
    expect(
      limited.items.some(
        (x) => x.resourceId === schedule.id || x.resourceId === fax.id,
      ),
    ).toBe(false);
    expect(limited.items[0].resourceId).toBe(source.id);
  });
  it("projects held originals as in progress and sends schedule approval attention to its distinct review", async () => {
    const before = await domain.dispatchOverview(ctx);
    const source = await domain.prepareDispatch(
      ctx,
      {
        channel: "email",
        recipient: { email: "held@example.invalid" },
        subject: "Synthetic held original",
        text: "Frozen synthetic content",
      },
      crypto.randomUUID(),
    );
    const schedules = new DispatchScheduleService(
      { MODE: "simulation" },
      domain,
    );
    const schedule = await schedules.create(
      ctx,
      {
        dispatchId: source.id,
        executeAt: new Date(Date.now() + 120_000).toISOString(),
        maxTotalMinor: 100,
      },
      crypto.randomUUID(),
    );
    const approval = await domain.listDispatches(
      ctx,
      undefined,
      100,
      "approval",
    );
    expect(approval.items.some((item) => item.id === source.id)).toBe(false);
    const ongoing = await domain.listDispatches(
      ctx,
      undefined,
      100,
      "in_progress",
    );
    const held = ongoing.items.find((item) => item.id === source.id);
    expect(held).toMatchObject({
      status: "prepared",
      activeSchedule: {
        id: schedule.id,
        status: "draft",
        executeAt: schedule.executeAt,
        maxTotalMinor: 100,
      },
    });
    expect(held).not.toHaveProperty("active_schedule_json");
    const after = await domain.dispatchOverview(ctx);
    expect(after.dispatches.approval).toBe(before.dispatches.approval);
    expect(after.dispatches.in_progress).toBe(
      before.dispatches.in_progress + 1,
    );
    const queue = await domain.attentionQueue(ctx, undefined, 100);
    expect(queue.items).toContainEqual({
      id: `approval_schedule_${schedule.id}`,
      kind: "approval",
      resourceId: schedule.id,
      route: `/app/schedules/${schedule.id}`,
      expiresAt: schedule.releaseUntil,
      channel: "email",
    });
    expect(
      queue.items.some(
        (item) => item.kind === "approval" && item.resourceId === source.id,
      ),
    ).toBe(false);
    expect(
      (await domain.attentionQueue(viewer, undefined, 100)).items.some(
        (item) => item.resourceId === schedule.id,
      ),
    ).toBe(false);
    await schedules.cancel(ctx, schedule.id, { expectedRevision: 1 });
    expect(
      (await domain.listDispatches(ctx, undefined, 100, "approval")).items.some(
        (item) => item.id === source.id,
      ),
    ).toBe(true);
  });
});
