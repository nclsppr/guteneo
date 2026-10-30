import type { McpServer } from "@modelcontextprotocol/server";
import manifest from "../../../packages/contracts/src/mcp-document-upload-resource.json";
import { isSupportedLocale } from "../../../packages/contracts/src/locale";
import { workspacePermissions } from "../../../packages/contracts/src/roles";
import {
  MCP_APP_UPLOAD_MAX_BYTES,
  MCP_APP_UPLOAD_PART_BYTES,
  MCP_APP_UPLOAD_MAX_PARTS,
  MCP_APP_UPLOAD_MAX_CALLS,
  MCP_APP_UPLOAD_TTL_SECONDS,
  type McpAppUploadOpenerData,
} from "../../../packages/contracts/src/mcp-app-upload";
import { AuthError, type AuthEnv, type McpIdentity } from "./auth";
import {
  assertCurrentMcpAppAuthority,
  productionMcpAppIdentityEnabled,
  selectedMcpAppWindowEnabled,
} from "./mcp-app-activation";
import { registerPinnedMcpAppResource } from "./mcp-app-resource";

export const MCP_DOCUMENT_UPLOAD_URI = manifest.resourceUri;
const code = "MCP_DOCUMENT_UPLOAD_UNAVAILABLE";
const message = "The private PDF upload interface is unavailable.";

export function mcpDocumentUploadEnabled(
  env: AuthEnv,
  identity: McpIdentity,
  now = Date.now(),
): boolean {
  return (
    workspacePermissions(identity.context.role).prepareDispatches &&
    (env.MCP_DOCUMENT_UPLOAD_APP === "enabled"
      ? productionMcpAppIdentityEnabled(env, identity, "documents:write", now)
      : selectedMcpAppWindowEnabled(
          env,
          identity,
          env.MCP_DOCUMENT_UPLOAD_APP,
          "documents:write",
          now,
        ))
  );
}

export function assertMcpDocumentUploadEnabled(
  env: AuthEnv,
  identity: McpIdentity,
): void {
  if (!mcpDocumentUploadEnabled(env, identity))
    throw new AuthError(code, message, 403);
}

/** Presentation and cached App callbacks retain current writer authority. */
export async function assertMcpDocumentUploadCurrent(
  env: AuthEnv,
  identity: McpIdentity,
): Promise<void> {
  await assertCurrentMcpAppAuthority(
    env,
    identity,
    (current) =>
      mcpDocumentUploadEnabled(env, current) &&
      current.context.role === identity.context.role &&
      Boolean(current.context.supervisorCanApprove) ===
        Boolean(identity.context.supervisorCanApprove) &&
      Boolean(current.context.supervisorCanReport) ===
        Boolean(identity.context.supervisorCanReport),
    code,
    message,
  );
}

export async function mcpDocumentUploadOpening(
  env: AuthEnv,
  identity: McpIdentity,
): Promise<McpAppUploadOpenerData> {
  await assertMcpDocumentUploadCurrent(env, identity);
  const user = await env.DB.prepare(
    "SELECT u.preferred_locale FROM users u JOIN memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id WHERE u.id=? AND m.organization_id=? AND m.role=? AND o.mode='production'",
  )
    .bind(
      identity.context.userId,
      identity.context.organizationId,
      identity.context.role,
    )
    .first<{ preferred_locale: string | null }>();
  if (!user) throw new AuthError(code, message, 403);
  return {
    surface: "guteneo-private-original-v1",
    ...(isSupportedLocale(user.preferred_locale)
      ? { locale: user.preferred_locale }
      : {}),
    limits: {
      maxBytes: MCP_APP_UPLOAD_MAX_BYTES,
      partBytes: MCP_APP_UPLOAD_PART_BYTES,
      maxParts: MCP_APP_UPLOAD_MAX_PARTS,
      maxCalls: MCP_APP_UPLOAD_MAX_CALLS,
      expiresWithinSeconds: MCP_APP_UPLOAD_TTL_SECONDS,
    },
  };
}

export function registerMcpDocumentUploadResource(
  server: McpServer,
  env: AuthEnv,
  identity: McpIdentity,
  assets?: Pick<Fetcher, "fetch">,
): void {
  registerPinnedMcpAppResource(server, env, manifest, {
    title: "Guteneo private PDF import",
    code,
    message,
    assertCurrent: () => assertMcpDocumentUploadCurrent(env, identity),
    assets,
  });
}
