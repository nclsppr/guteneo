import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DomainService, type ActorContext } from "../../packages/domain/src/index";
import { SavedRecipientService } from "../../apps/api/src/saved-recipients";
import { migratedD1 } from "../helpers/migrated-d1";

let fixture: Awaited<ReturnType<typeof migratedD1>>, domain: DomainService, recipients: SavedRecipientService;
const ctx: ActorContext = { organizationId: "org_atelier", userId: "user_atelier", role: "admin", actor: "browser" };
const other: ActorContext = { organizationId: "org_studio", userId: "user_studio", role: "admin", actor: "browser" };
beforeAll(async () => {
  fixture = await migratedD1("saved-recipients");
  for (const sql of readFileSync(new URL("../../scripts/seed.sql", import.meta.url), "utf8").replace(/^--.*$/gm, "").split(";").filter((sql) => sql.trim()))
    await fixture.db.prepare(sql).run();
  domain = new DomainService(fixture.db, { mode: "simulation" });
  recipients = new SavedRecipientService(domain);
});
afterAll(async () => { await fixture?.mf.dispose(); });
describe("tenant saved-recipient snapshots", () => {
  it("normalizes each channel and keeps stable creation receipts without exposing another tenant", async () => {
    const value = { label: "Synthetic email", channel: "email", recipient: { email: "  Example@EXAMPLE.invalid " } };
    const key = crypto.randomUUID();
    const created = await recipients.create(ctx, value, key);
    expect(created).toMatchObject({ revision: 1, recipient: { email: "example@example.invalid" } });
    expect((await recipients.create(ctx, value, key)).id).toBe(created.id);
    await expect(recipients.create(ctx, { ...value, label: "Other" }, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(recipients.get(other, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await recipients.list(other)).items).toEqual([]);
  });
  it("refuses invalid destinations and observers cannot read contact details", async () => {
    await expect(recipients.create(ctx, { label: "Invalid", channel: "fax", recipient: { phone: "123" } }, crypto.randomUUID())).rejects.toBeInstanceOf(Error);
    await expect(recipients.list({ ...ctx, role: "viewer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const time = new Date().toISOString();
    await fixture.db.prepare("INSERT INTO users(id,name,email,created_at) VALUES('contact_viewer','Viewer','viewer@example.invalid',?)").bind(time).run();
    await fixture.db.prepare("INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,'contact_viewer','viewer',?)").bind(ctx.organizationId,time).run();
    await expect(recipients.list({ ...ctx, userId: "contact_viewer", role: "viewer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("uses optimistic revisions and editing never changes a prepared dispatch", async () => {
    const created = await recipients.create(ctx, { label: "Synthetic original", channel: "email", recipient: { email: "original@example.invalid" } }, crypto.randomUUID());
    const dispatch = await domain.prepareDispatch(ctx, { channel: "email", recipient: created.recipient, subject: "Synthetic", text: "Synthetic immutable message" }, crypto.randomUUID());
    const updated = await recipients.update(ctx, created.id, { expectedRevision: 1, value: { label: "Synthetic revision", channel: "email", recipient: { email: "changed@example.invalid" } } });
    expect(updated.revision).toBe(2);
    await expect(recipients.update(ctx, created.id, { expectedRevision: 1, value: { label: "Conflict", channel: "email", recipient: { email: "conflict@example.invalid" } } })).rejects.toMatchObject({ code: "RECIPIENT_CHANGED" });
    expect((await domain.getDispatch(ctx, dispatch.id)).dispatch.recipient_json).toBe(JSON.stringify({ email: "original@example.invalid" }));
    await expect(recipients.remove(ctx, created.id, { expectedRevision: 1 })).rejects.toMatchObject({ code: "RECIPIENT_CHANGED" });
    await recipients.remove(ctx, created.id, { expectedRevision: 2 });
    await expect(recipients.get(ctx, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("deletion cannot make a stale create key resurrect contact data", async () => {
    const value = { label: "Delete fixture", channel: "fax", recipient: { phone: "+35242123456" } }, key = crypto.randomUUID();
    const created = await recipients.create(ctx, value, key);
    await recipients.remove(ctx, created.id, { expectedRevision: 1 });
    await expect(recipients.create(ctx, value, key)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await fixture.db.prepare("SELECT 1 FROM saved_recipients WHERE id=?").bind(created.id).first()).toBeNull();
  });
  it("supports bounded cursors and validated complete postal blocks", async () => {
    const created = await recipients.create(ctx, { label: "Synthetic postal", channel: "postal", recipient: { addressLines: ["Synthetic Person", "12 Synthetic Street", "L-1234 LUXEMBOURG", "LUXEMBOURG"], country: "LU" } }, crypto.randomUUID());
    expect(created.channel).toBe("postal");
    const first = await recipients.list(ctx, undefined, 1);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const next = await recipients.list(ctx, first.nextCursor!, 1);
    expect(next.items[0].id).not.toBe(first.items[0].id);
    const audits = await fixture.db.prepare("SELECT details_json FROM audit_log WHERE action LIKE 'recipient.%'").all<{details_json:string}>();
    expect(audits.results.every((row) => row.details_json === "{}")).toBe(true);
  });
});
