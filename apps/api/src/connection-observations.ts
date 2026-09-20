import type { AuthEnv, McpIdentity } from "./auth";

/** Only a validated successful tool result can call this; never authentication,
 * discovery, a browser setup action, or an assistant-supplied declaration. */
export async function recordSuccessfulConnectionTool(
  env: AuthEnv,
  identity: McpIdentity,
): Promise<void> {
  if (env.MODE !== "production" || !identity.connectionObservation) return;
  const { connectionId, authorizationRevision } =
    identity.connectionObservation;
  const timestamp = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE connection_tool_observations
     SET last_successful_tool_at=MAX(COALESCE(last_successful_tool_at,''),?)
     WHERE connection_id=? AND organization_id=? AND user_id=? AND authorization_revision=?
       AND EXISTS(SELECT 1 FROM authorized_connections c
         JOIN memberships m ON m.organization_id=c.organization_id AND m.user_id=c.user_id
         JOIN organizations o ON o.id=c.organization_id
         WHERE c.id=connection_tool_observations.connection_id
           AND c.organization_id=connection_tool_observations.organization_id
           AND c.user_id=connection_tool_observations.user_id
           AND c.client_id=? AND c.status='active' AND o.mode='production')`,
  )
    .bind(
      timestamp,
      connectionId,
      identity.context.organizationId,
      identity.context.userId,
      authorizationRevision,
      identity.clientId,
    )
    .run();
}
