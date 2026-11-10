import { membershipPermissionFence, type ActorContext, type Mode } from "../../../packages/domain/src/index";

export type LifecycleActor = ActorContext & {
  authority?: { connectionId: string; authorizationRevision: number };
};

/** A final SQL fence retains the authenticated credential's current authority. */
export function lifecycleAuthority(ctx: LifecycleActor, mode: Mode, permission: "prepareDispatches" | "approveDispatches" = "prepareDispatches") {
  const membership = membershipPermissionFence(ctx, permission);
  let condition = `(${membership.condition}) AND EXISTS(SELECT 1 FROM organizations WHERE id=? AND mode=?)`;
  const values: (string | number | null)[] = [...membership.values, ctx.organizationId, mode];
  if (ctx.actor === "mcp") {
    if (ctx.authority) {
      condition += " AND EXISTS(SELECT 1 FROM authorized_connections c JOIN connection_tool_observations o ON o.connection_id=c.id WHERE c.id=? AND c.organization_id=? AND c.user_id=? AND c.status='active' AND o.authorization_revision=?)";
      values.push(ctx.authority.connectionId, ctx.organizationId, ctx.userId, ctx.authority.authorizationRevision);
    } else if (mode === "production") condition += " AND 0=1";
  } else if (ctx.actor === "browser") {
    if (ctx.documentSessionHash) {
      condition += " AND EXISTS(SELECT 1 FROM browser_sessions b WHERE b.token_hash=? AND b.organization_id=? AND b.user_id=? AND b.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (?='simulation' OR b.is_development=0))";
      values.push(ctx.documentSessionHash, ctx.organizationId, ctx.userId, mode);
    } else if (mode === "production") condition += " AND 0=1";
  }
  return { condition, values };
}
