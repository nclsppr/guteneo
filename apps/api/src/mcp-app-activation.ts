import { z } from "zod";
import {
  AuthError,
  authenticateMcp,
  type AuthEnv,
  type McpIdentity,
} from "./auth";

const connectionWindow = z
  .object({
    enabled: z.literal(true),
    connectionId: z
      .string()
      .min(1)
      .max(180)
      .regex(/^[A-Za-z0-9_-]+$/),
    authorizationRevision: z.number().int().nonnegative().safe(),
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export function productionMcpAppIdentityEnabled(
  env: AuthEnv,
  identity: McpIdentity,
  scope: string,
  now = Date.now(),
): boolean {
  if (
    env.ENVIRONMENT !== "production" ||
    env.MODE !== "production" ||
    env.APP_ORIGIN !== "https://guteneo.com" ||
    !identity.connectionObservation ||
    identity.context.actor !== "mcp" ||
    identity.token.startsWith("gtn_dev_") ||
    !identity.verifiedTokenIssuer ||
    !identity.scopes.includes(scope) ||
    identity.expiresAt * 1000 <= now
  )
    return false;
  return true;
}

/** A selected presentation surface never grants additional OAuth authority. */
export function selectedMcpAppWindowEnabled(
  env: AuthEnv,
  identity: McpIdentity,
  setting: string | undefined,
  scope: string,
  now = Date.now(),
): boolean {
  if (
    !identity.connectionObservation ||
    !productionMcpAppIdentityEnabled(env, identity, scope, now) ||
    !setting ||
    setting.length > 1024
  )
    return false;
  try {
    const parsed = connectionWindow.parse(JSON.parse(setting));
    const start = Date.parse(parsed.startsAt),
      end = Date.parse(parsed.expiresAt);
    return (
      start <= now &&
      now < end &&
      end > start &&
      end - start <= 60 * 60_000 &&
      parsed.connectionId === identity.connectionObservation.connectionId &&
      parsed.authorizationRevision ===
        identity.connectionObservation.authorizationRevision
    );
  } catch {
    return false;
  }
}

export async function assertCurrentMcpAppAuthority(
  env: AuthEnv,
  identity: McpIdentity,
  enabled: (current: McpIdentity) => boolean,
  code: string,
  message: string,
): Promise<void> {
  const denied = () => new AuthError(code, message, 403);
  if (!enabled(identity)) throw denied();
  const current = await authenticateMcp(
    new Request(`${env.APP_ORIGIN}/mcp`, {
      headers: { Authorization: `Bearer ${identity.token}` },
    }),
    env,
  );
  if (
    !enabled(current) ||
    current.clientId !== identity.clientId ||
    current.context.userId !== identity.context.userId ||
    current.context.organizationId !== identity.context.organizationId ||
    current.connectionObservation?.connectionId !==
      identity.connectionObservation?.connectionId ||
    current.connectionObservation?.authorizationRevision !==
      identity.connectionObservation?.authorizationRevision
  )
    throw denied();
}
