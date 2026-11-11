import { z } from "zod";
import {
  faxNumberProblem,
  normalizeFaxNumber,
} from "../../../packages/contracts/src/fax-number";
import {
  DomainError,
  membershipPermissionFence,
  type ActorContext,
} from "../../../packages/domain/src/index";

/** Fax numbers and email addresses a workspace keeps to reuse when preparing. */
export type SavedRecipient = {
  id: string;
  channel: "fax" | "email";
  address: string;
  created_at: string;
};

export const MAX_SAVED_RECIPIENTS = 500;

const channel = z.enum(["fax", "email"]);
export const savedRecipientInput = z
  .object({ channel, address: z.string().min(3).max(320) })
  .strict();

/** The stored form: E.164 for fax, lower case for email. */
export function normalizeSavedAddress(
  kind: SavedRecipient["channel"],
  address: string,
) {
  if (kind === "fax") {
    const phone = normalizeFaxNumber(address);
    if (faxNumberProblem(phone))
      throw new DomainError(
        "INVALID_RECIPIENT",
        "Enter a fax number this workspace can prepare.",
      );
    return phone;
  }
  const email = address.trim().toLowerCase();
  if (!z.email().safeParse(email).success)
    throw new DomainError(
      "INVALID_RECIPIENT",
      "Enter a complete email address.",
    );
  return email;
}

/**
 * Every read and write is bound to the authenticated membership: listing needs
 * current membership, saving and removing need current preparation authority.
 * Addresses are never written to logs or audit details.
 */
export class SavedRecipientService {
  constructor(private readonly db: D1Database) {}

  private member(ctx: ActorContext) {
    return {
      condition:
        "EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=? AND m.user_id=? AND m.role=?)",
      values: [ctx.organizationId, ctx.userId, ctx.role],
    };
  }

  async list(ctx: ActorContext, kind?: SavedRecipient["channel"]) {
    const membership = this.member(ctx);
    const channelFilter = kind ? "AND channel=?" : "";
    const rows = await this.db
      .prepare(
        `SELECT id,channel,address,created_at FROM saved_recipients WHERE organization_id=? ${channelFilter} AND ${membership.condition} ORDER BY channel,address LIMIT ${MAX_SAVED_RECIPIENTS}`,
      )
      .bind(ctx.organizationId, ...(kind ? [kind] : []), ...membership.values)
      .all<SavedRecipient>();
    return { items: rows.results };
  }

  async save(ctx: ActorContext, input: z.infer<typeof savedRecipientInput>) {
    const address = normalizeSavedAddress(input.channel, input.address);
    const authority = membershipPermissionFence(ctx, "prepareDispatches");
    const id = `rcp_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const [inserted] = await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO saved_recipients(id,organization_id,channel,address,created_at) SELECT ?,?,?,?,? WHERE ${authority.condition} AND (SELECT count(*) FROM saved_recipients WHERE organization_id=?)<${MAX_SAVED_RECIPIENTS}`,
        )
        .bind(
          id,
          ctx.organizationId,
          input.channel,
          address,
          now,
          ...authority.values,
          ctx.organizationId,
        ),
      this.db
        .prepare(
          "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,'recipient.saved',?,?,? WHERE changes()=1",
        )
        .bind(
          crypto.randomUUID(),
          ctx.organizationId,
          ctx.userId,
          id,
          JSON.stringify({ channel: input.channel }),
          now,
        ),
    ]);
    const saved = await this.db
      .prepare(
        "SELECT id,channel,address,created_at FROM saved_recipients WHERE organization_id=? AND channel=? AND address=?",
      )
      .bind(ctx.organizationId, input.channel, address)
      .first<SavedRecipient>();
    if (!saved) {
      // Nothing was written: either the authority fence refused or the list
      // is full. Tell them apart without revealing other workspaces.
      const allowed = await this.db
        .prepare(`SELECT 1 FROM memberships WHERE ${authority.condition}`)
        .bind(...authority.values)
        .first();
      if (!allowed)
        throw new DomainError("FORBIDDEN", "Editing permission required.", 403);
      throw new DomainError(
        "SAVED_RECIPIENTS_FULL",
        "This workspace already keeps the maximum number of recipients.",
        409,
      );
    }
    return { recipient: saved, created: !!inserted?.meta.changes };
  }

  async remove(ctx: ActorContext, id: string) {
    const authority = membershipPermissionFence(ctx, "prepareDispatches");
    const now = new Date().toISOString();
    const [removed] = await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM saved_recipients WHERE organization_id=? AND id=? AND ${authority.condition}`,
        )
        .bind(ctx.organizationId, id, ...authority.values),
      this.db
        .prepare(
          "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,'recipient.deleted',?,'{}',? WHERE changes()=1",
        )
        .bind(crypto.randomUUID(), ctx.organizationId, ctx.userId, id, now),
    ]);
    if (removed?.meta.changes) return { deleted: true };
    const allowed = await this.db
      .prepare(`SELECT 1 FROM memberships WHERE ${authority.condition}`)
      .bind(...authority.values)
      .first();
    if (!allowed)
      throw new DomainError("FORBIDDEN", "Editing permission required.", 403);
    throw new DomainError("NOT_FOUND", "Recipient not found.", 404);
  }
}
