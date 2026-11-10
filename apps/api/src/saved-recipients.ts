import {
  savedRecipientInput, savedRecipientMutation, savedRecipientDelete,
  type SavedRecipientView,
} from "../../../packages/contracts/src/saved-recipients";
import { validateRecipient } from "../../../packages/contracts/src/content";
import { canonicalJson, DomainError, sha256, type DomainService } from "../../../packages/domain/src/index";
import { lifecycleAuthority, type LifecycleActor as ActorContext } from "./lifecycle-authority";

type Row = { id: string; label: string; channel: "fax" | "email" | "postal"; recipient_json: string; revision: number; created_at: string; updated_at: string; request_hash: string };
const reference = (id: string) => {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new DomainError("INVALID_INPUT", "Invalid recipient reference.");
  return id;
};
const view = (row: Row): SavedRecipientView => ({
  id: row.id, label: row.label, channel: row.channel,
  recipient: JSON.parse(row.recipient_json), revision: row.revision,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

/** Address-book reads require preparation rights; viewer access grants no contact export. */
export class SavedRecipientService {
  constructor(private readonly domain: DomainService) {}
  async list(ctx: ActorContext, cursor?: string, limit = 30) {
    await this.domain.authorizeWrite(ctx);
    if (cursor) reference(cursor);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError("INVALID_INPUT", "Choose a page size from 1 to 100.");
    const fence = lifecycleAuthority(ctx, this.domain.config.mode);
    const rows = await this.domain.db.prepare(`SELECT * FROM saved_recipients WHERE organization_id=? AND id>? AND ${fence.condition} ORDER BY id LIMIT ?`)
      .bind(ctx.organizationId, cursor ?? "", ...fence.values, limit + 1).all<Row>();
    return { items: rows.results.slice(0, limit).map(view), nextCursor: rows.results.length > limit ? rows.results[limit - 1].id : null };
  }
  async get(ctx: ActorContext, id: string) {
    await this.domain.authorizeWrite(ctx);
    const fence = lifecycleAuthority(ctx, this.domain.config.mode);
    const row = await this.domain.db.prepare(`SELECT * FROM saved_recipients WHERE organization_id=? AND id=? AND ${fence.condition}`)
      .bind(ctx.organizationId, reference(id), ...fence.values).first<Row>();
    if (!row) throw new DomainError("NOT_FOUND", "Saved recipient not found.", 404);
    return view(row);
  }
  async create(ctx: ActorContext, input: unknown, key: string) {
    await this.domain.authorizeWrite(ctx);
    if (!key || key.length > 200 || /[\r\n\0]/.test(key)) throw new DomainError("IDEMPOTENCY_REQUIRED", "A stable idempotency key is required.");
    const parsed = savedRecipientInput.parse(input), recipient = validateRecipient(parsed.channel, parsed.recipient);
    const hash = await sha256(canonicalJson({ ...parsed, recipient }));
    const fence = lifecycleAuthority(ctx, this.domain.config.mode), id = `rcp_${crypto.randomUUID()}`, now = new Date().toISOString();
    await this.domain.db.batch([
      this.domain.db.prepare(`INSERT INTO saved_recipients(id,organization_id,label,channel,recipient_json,revision,request_key,request_hash,created_by,updated_by,created_at,updated_at) SELECT ?,?,?,?,?,1,?,?,?,?,?,? WHERE ${fence.condition} AND (SELECT count(*) FROM saved_recipients WHERE organization_id=?)<1000 AND NOT EXISTS(SELECT 1 FROM idempotency_keys WHERE organization_id=? AND operation='recipient.create' AND key=?) ON CONFLICT(organization_id,request_key) DO NOTHING`)
        .bind(id, ctx.organizationId, parsed.label, parsed.channel, canonicalJson(recipient), key, hash, ctx.userId, ctx.userId, now, now, ...fence.values, ctx.organizationId, ctx.organizationId, key),
      this.domain.db.prepare("INSERT INTO idempotency_keys(organization_id,operation,key,request_hash,resource_id,created_at) SELECT ?,'recipient.create',?,?,?,? WHERE changes()=1").bind(ctx.organizationId, key, hash, id, now),
      this.audit(ctx, "recipient.created", id, now),
    ]);
    const stored = await this.domain.db.prepare("SELECT resource_id AS id,request_hash FROM idempotency_keys WHERE organization_id=? AND operation='recipient.create' AND key=?").bind(ctx.organizationId, key).first<Row>();
    if (!stored) { await this.domain.authorizeWrite(ctx); throw new DomainError("RECIPIENT_LIMIT", "This workspace has reached its saved-recipient limit.", 429); }
    if (stored.request_hash !== hash) throw new DomainError("IDEMPOTENCY_CONFLICT", "This key belongs to a different recipient.", 409);
    return this.get(ctx, stored.id);
  }
  async update(ctx: ActorContext, id: string, input: unknown) {
    await this.domain.authorizeWrite(ctx);
    const { expectedRevision, value } = savedRecipientMutation.parse(input), recipient = validateRecipient(value.channel, value.recipient);
    const fence = lifecycleAuthority(ctx, this.domain.config.mode), now = new Date().toISOString();
    const result = await this.domain.db.batch([
      this.domain.db.prepare(`UPDATE saved_recipients SET label=?,channel=?,recipient_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE organization_id=? AND id=? AND revision=? AND ${fence.condition} RETURNING id`)
        .bind(value.label, value.channel, canonicalJson(recipient), ctx.userId, now, ctx.organizationId, reference(id), expectedRevision, ...fence.values),
      this.audit(ctx, "recipient.updated", id, now),
    ]);
    if (!result[0].results.length) { await this.get(ctx, id); throw new DomainError("RECIPIENT_CHANGED", "This saved recipient changed. Refresh before editing.", 409); }
    return this.get(ctx, id);
  }
  async remove(ctx: ActorContext, id: string, input: unknown) {
    await this.domain.authorizeWrite(ctx);
    const { expectedRevision } = savedRecipientDelete.parse(input), fence = lifecycleAuthority(ctx, this.domain.config.mode), now = new Date().toISOString();
    const result = await this.domain.db.batch([
      this.domain.db.prepare(`DELETE FROM saved_recipients WHERE organization_id=? AND id=? AND revision=? AND ${fence.condition} RETURNING id`)
        .bind(ctx.organizationId, reference(id), expectedRevision, ...fence.values),
      this.audit(ctx, "recipient.deleted", id, now),
    ]);
    if (!result[0].results.length) { await this.get(ctx, id); throw new DomainError("RECIPIENT_CHANGED", "This saved recipient changed. Refresh before deleting.", 409); }
    return { id, deleted: true as const };
  }
  private audit(ctx: ActorContext, action: string, id: string, time: string) {
    return this.domain.db.prepare("INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,?,?,'{}',? WHERE changes()=1")
      .bind(crypto.randomUUID(), ctx.organizationId, ctx.userId, action, id, time);
  }
}
