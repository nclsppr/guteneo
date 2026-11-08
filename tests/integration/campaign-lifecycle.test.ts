import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  DomainService,
  type ActorContext,
  type Dispatch,
} from "../../packages/domain/src/index";
import { migratedD1 } from "../helpers/migrated-d1";

let fixture: Awaited<ReturnType<typeof migratedD1>>;
let db: D1Database;
let domain: DomainService;
const ctx: ActorContext = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
};
const other: ActorContext = {
  organizationId: "org_studio",
  userId: "user_studio",
  role: "admin",
  actor: "browser",
};
const key = () => crypto.randomUUID();
const campaign = async () =>
  (await domain.createCampaign(ctx, { name: "Synthetic lifecycle" }))
    .id as string;
const status = async (id: string) =>
  (await domain.getCampaign(ctx, id)).campaign.status;
const prepare = (campaignId: string) =>
  domain.prepareDispatch(
    ctx,
    {
      channel: "email",
      recipient: { email: `${key()}@example.invalid` },
      text: "Synthetic lifecycle",
      subject: "Synthetic lifecycle",
      campaignId,
    },
    key(),
  );
async function queue(d: Dispatch) {
  await domain.approveDispatch(ctx, d.id, d.fingerprint);
  const idempotency = key();
  const accepted = await Promise.all([
    domain.confirmDispatch(ctx, d.id, idempotency),
    domain.confirmDispatch(ctx, d.id, idempotency),
  ]);
  expect(accepted.map((value) => value.status)).toEqual(["queued", "queued"]);
}
async function closed(id: string) {
  return Boolean(
    await db
      .prepare(
        "SELECT 1 FROM operationally_closed_dispatches WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(ctx.organizationId, id)
      .first(),
  );
}
beforeAll(async () => {
  fixture = await migratedD1("campaign-lifecycle");
  db = fixture.db;
  const seed = readFileSync(
    new URL("../../scripts/seed.sql", import.meta.url),
    "utf8",
  );
  for (const statement of seed
    .replace(/^--.*$/gm, "")
    .split(";")
    .filter((sql) => sql.trim()))
    await db.prepare(statement).run();
  domain = new DomainService(db, { mode: "simulation" });
});
afterAll(async () => {
  await fixture?.mf.dispose();
});

describe("campaign closure through migrated D1 and real domain commands", () => {
  it("requires frozen nonempty membership, closes after the last cancellation and retains the manifest", async () => {
    const time = new Date().toISOString();
    await expect(
      db
        .prepare(
          "INSERT INTO campaigns(id,organization_id,name,status,created_at,updated_at) VALUES(?,?,?,'completed',?,?)",
        )
        .bind(key(), ctx.organizationId, "Forged completion", time, time)
        .run(),
    ).rejects.toThrow("campaign_initial_state_invalid");
    const empty = await campaign();
    await expect(
      db
        .prepare("UPDATE campaigns SET status='completed' WHERE id=?")
        .bind(empty)
        .run(),
    ).rejects.toThrow("campaign_not_closed");
    const id = await campaign();
    const a = await prepare(id),
      b = await prepare(id);
    await domain.approveDispatch(ctx, a.id, a.fingerprint);
    expect(await status(id)).toBe("frozen");
    await expect(
      db
        .prepare("UPDATE campaigns SET status='completed' WHERE id=?")
        .bind(id)
        .run(),
    ).rejects.toThrow("campaign_not_closed");
    await domain.cancelDispatch(ctx, a.id);
    expect(await status(id)).toBe("frozen");
    await domain.cancelDispatch(ctx, b.id);
    expect(await status(id)).toBe("completed");
    expect(await closed(a.id)).toBe(true);
    await expect(prepare(id)).rejects.toMatchObject({
      code: "CAMPAIGN_FROZEN",
    });
    await expect(
      db.prepare("DELETE FROM dispatches WHERE id=?").bind(a.id).run(),
    ).rejects.toThrow("campaign_frozen");
    await expect(
      db
        .prepare("UPDATE campaigns SET status='draft' WHERE id=?")
        .bind(id)
        .run(),
    ).rejects.toThrow("campaign_immutable");
    await expect(
      db
        .prepare("UPDATE campaigns SET manifest_hash='changed' WHERE id=?")
        .bind(id)
        .run(),
    ).rejects.toThrow("campaign_immutable");
    await expect(domain.getCampaign(other, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("projects reordered final facts without repeating acceptance or the provider invocation", async () => {
    const id = await campaign(),
      d = await prepare(id);
    await queue(d);
    const send = vi.fn(async () => ({
      status: "accepted" as const,
      providerId: `remote_${d.id}`,
    }));
    await Promise.all([
      domain.processDispatch(d.id, { name: "simulation:email", submit: send }),
      domain.processDispatch(d.id, { name: "simulation:email", submit: send }),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await status(id)).toBe("frozen");
    const event = {
      provider: "simulation:email",
      providerId: `remote_${d.id}`,
      occurredAt: new Date().toISOString(),
    };
    const eventId = key();
    await Promise.all([
      domain.ingestEvent({ ...event, eventId, kind: "delivered" }),
      domain.ingestEvent({ ...event, eventId, kind: "delivered" }),
      domain.ingestEvent({ ...event, eventId: key(), kind: "accepted" }),
    ]);
    expect(await status(id)).toBe("completed");
    await domain.ingestEvent({ ...event, eventId: key(), kind: "failed" });
    expect((await domain.getDispatch(ctx, d.id)).dispatch.status).toBe(
      "delivered",
    );
    await domain.ingestEvent({ ...event, eventId: key(), kind: "complained" });
    expect((await domain.getDispatch(ctx, d.id)).dispatch.status).toBe(
      "complained",
    );
    expect(await status(id)).toBe("completed");
    expect(
      await db
        .prepare("SELECT status FROM reservations WHERE dispatch_id=?")
        .bind(d.id)
        .first(),
    ).toMatchObject({ status: "confirmed" });
    expect(
      await db
        .prepare("SELECT count(*) n FROM attempts WHERE dispatch_id=?")
        .bind(d.id)
        .first(),
    ).toEqual({ n: 1 });
    expect(
      await db
        .prepare("SELECT count(*) n FROM outbox WHERE dispatch_id=?")
        .bind(d.id)
        .first(),
    ).toEqual({ n: 1 });
  });

  it("retains unknown work and holds until a matching final fact closes the original attempt", async () => {
    const id = await campaign(),
      d = await prepare(id);
    await queue(d);
    const send = vi.fn(async () => ({
      status: "submission_unknown" as const,
      providerId: `unknown_${d.id}`,
    }));
    await domain.processDispatch(d.id, {
      name: "simulation:email",
      submit: send,
    });
    expect(await status(id)).toBe("frozen");
    expect(await closed(d.id)).toBe(false);
    await domain.processDispatch(d.id, {
      name: "simulation:email",
      submit: send,
    });
    expect(send).toHaveBeenCalledTimes(1);
    await domain.ingestEvent({
      provider: "wrong-provider",
      providerId: `unknown_${d.id}`,
      dispatchId: d.id,
      eventId: key(),
      kind: "delivered",
      occurredAt: new Date().toISOString(),
    });
    expect(await status(id)).toBe("frozen");
    await domain.ingestEvent({
      provider: "simulation:email",
      providerId: `unknown_${d.id}`,
      eventId: key(),
      kind: "accepted",
      occurredAt: new Date().toISOString(),
    });
    expect(await status(id)).toBe("frozen");
    await domain.ingestEvent({
      provider: "simulation:email",
      providerId: `unknown_${d.id}`,
      eventId: key(),
      kind: "delivered",
      occurredAt: new Date().toISOString(),
    });
    expect(await status(id)).toBe("completed");
    expect(await closed(d.id)).toBe(true);
    expect(
      await db
        .prepare("SELECT status FROM attempts WHERE dispatch_id=?")
        .bind(d.id)
        .first(),
    ).toMatchObject({ status: "unknown" });
  });

  it("does not infer closure from null attempt ownership", async () => {
    const id = await campaign(),
      d = await prepare(id),
      time = new Date().toISOString();
    await domain.approveDispatch(ctx, d.id, d.fingerprint);
    await db
      .prepare(
        "INSERT INTO attempts(id,organization_id,dispatch_id,provider,status,created_at,updated_at) VALUES(?,?,?,'synthetic','unknown',?,?)",
      )
      .bind(key(), ctx.organizationId, d.id, time, time)
      .run();
    await domain.cancelDispatch(ctx, d.id);
    expect(await closed(d.id)).toBe(false);
    expect(await status(id)).toBe("frozen");
  });

  it("refuses closure when executed work loses its funding receipt", async () => {
    const id = await campaign(),
      d = await prepare(id);
    await queue(d);
    await domain.processDispatch(d.id, {
      name: "simulation:email",
      submit: async () => ({
        status: "accepted",
        providerId: `missing_funding_${d.id}`,
      }),
    });
    // Adversarial local persistence fixture: absence is not proof of no liability.
    await db
      .prepare(
        "DELETE FROM reservations WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(ctx.organizationId, d.id)
      .run();
    await domain.ingestEvent({
      provider: "simulation:email",
      providerId: `missing_funding_${d.id}`,
      eventId: key(),
      kind: "delivered",
      occurredAt: new Date().toISOString(),
    });
    expect((await domain.getDispatch(ctx, d.id)).dispatch.status).toBe(
      "delivered",
    );
    expect(await closed(d.id)).toBe(false);
    expect(await status(id)).toBe("frozen");
  });

  it("treats postal handover as operational closure without claiming delivery", async () => {
    const id = await campaign();
    const document = await domain.registerDocument(ctx, {
      name: "synthetic.pdf",
      sha256: "e".repeat(64),
      size: 100,
      pages: 1,
      status: "ready",
      source: "import",
      storageKey: `synthetic/${key()}`,
    });
    const d = await domain.prepareDispatch(
      ctx,
      {
        channel: "postal",
        documentId: document.id,
        campaignId: id,
        recipient: {
          name: "Synthetic",
          line1: "1 Example street",
          postalCode: "75001",
          city: "Paris",
          country: "FR",
        },
      },
      key(),
    );
    await queue(d);
    await domain.processDispatch(d.id, {
      name: "simulation:postal",
      submit: async () => ({
        status: "accepted",
        providerId: `postal_${d.id}`,
      }),
    });
    await domain.ingestEvent({
      provider: "simulation:postal",
      providerId: `postal_${d.id}`,
      eventId: key(),
      kind: "printed",
      occurredAt: new Date().toISOString(),
    });
    expect(await status(id)).toBe("frozen");
    await domain.ingestEvent({
      provider: "simulation:postal",
      providerId: `postal_${d.id}`,
      eventId: key(),
      kind: "handed_to_post",
      occurredAt: new Date().toISOString(),
    });
    expect(await status(id)).toBe("completed");
    expect((await domain.getDispatch(ctx, d.id)).dispatch.status).toBe(
      "handed_to_post",
    );
    await domain.ingestEvent({
      provider: "simulation:postal",
      providerId: `postal_${d.id}`,
      eventId: key(),
      kind: "failed",
      occurredAt: new Date().toISOString(),
    });
    expect((await domain.getDispatch(ctx, d.id)).dispatch.status).toBe(
      "failed",
    );
    expect(await status(id)).toBe("completed");
  });
});
