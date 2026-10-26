import { z } from "zod";
import mcpUiProbeManifest from "../../../packages/contracts/src/mcp-ui-probe-resource.json";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  AuthError,
  authenticateMcp,
  type AuthEnv,
  type McpIdentity,
} from "./auth";
import { readLimited } from "./documents";

export const MCP_UI_PROBE_URI = mcpUiProbeManifest.resourceUri;
export const MCP_UI_PROBE_ACK = {
  probe: "guteneo-mcp-ui-v1",
  bridge: "available",
  contentAccess: false,
} as const;
export const mcpUiProbeResult = z
  .object({
    probe: z.literal(MCP_UI_PROBE_ACK.probe),
    bridge: z.literal(MCP_UI_PROBE_ACK.bridge),
    contentAccess: z.literal(false),
  })
  .strict();
const activation = z
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

/** This server-owned diagnostic window grants no document or business authority. */
export function mcpUiProbeEnabled(
  env: AuthEnv,
  identity: McpIdentity,
  now = Date.now(),
): boolean {
  if (
    env.ENVIRONMENT !== "production" ||
    env.MODE !== "production" ||
    env.APP_ORIGIN !== "https://guteneo.com" ||
    !env.MCP_UI_PROBE ||
    env.MCP_UI_PROBE.length > 1024 ||
    !identity.connectionObservation ||
    identity.context.actor !== "mcp" ||
    identity.token.startsWith("gtn_dev_") ||
    !identity.verifiedTokenIssuer ||
    !identity.scopes.includes("documents:read") ||
    identity.expiresAt * 1000 <= now
  )
    return false;
  try {
    const parsed = activation.parse(JSON.parse(env.MCP_UI_PROBE));
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

/** Reuse normal token/membership/connection verification for cached callbacks. */
export async function assertMcpUiProbeCurrent(
  env: AuthEnv,
  identity: McpIdentity,
): Promise<void> {
  const denied = () =>
    new AuthError(
      "MCP_UI_PROBE_UNAVAILABLE",
      "This diagnostic is unavailable.",
      403,
    );
  if (!mcpUiProbeEnabled(env, identity)) throw denied();
  const current = await authenticateMcp(
    new Request(`${env.APP_ORIGIN}/mcp`, {
      headers: { Authorization: `Bearer ${identity.token}` },
    }),
    env,
  );
  if (
    !mcpUiProbeEnabled(env, current) ||
    current.clientId !== identity.clientId ||
    current.context.userId !== identity.context.userId ||
    current.context.organizationId !== identity.context.organizationId
  )
    throw denied();
}

export function registerMcpUiProbeResource(
  server: McpServer,
  env: AuthEnv,
  identity: McpIdentity,
  manifest: {
    path: string;
    bytes: number;
    sha256: string;
    resourceUri: string;
  },
  assets?: Pick<Fetcher, "fetch">,
): void {
  const metadata = {
    ui: {
      prefersBorder: true,
      csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
    },
  };
  registerAppResource(
    server,
    "Guteneo host diagnostic",
    manifest.resourceUri,
    { _meta: metadata },
    async () => {
      await assertMcpUiProbeCurrent(env, identity);
      if (!assets)
        throw new AuthError(
          "MCP_UI_PROBE_UNAVAILABLE",
          "This diagnostic is unavailable.",
          503,
        );
      const controller = new AbortController();
      const unavailable = () =>
        new AuthError(
          "MCP_UI_PROBE_UNAVAILABLE",
          "This diagnostic is unavailable.",
          503,
        );
      let rejectDeadline: () => void = () => {};
      const expired = new Promise<never>((_resolve, reject) => {
        rejectDeadline = () => reject(unavailable());
      });
      const timeout = setTimeout(() => {
        controller.abort();
        rejectDeadline();
      }, 5000);
      let response: Response | undefined;
      try {
        response = await Promise.race([
          assets
            .fetch(
              new Request(new URL(manifest.path, env.APP_ORIGIN), {
                signal: controller.signal,
              }),
            )
            .then((loaded) => {
              if (controller.signal.aborted) {
                void loaded.body?.cancel().catch(() => {});
                throw unavailable();
              }
              return loaded;
            }),
          expired,
        ]);
        if (
          !response.ok ||
          response.headers
            .get("Content-Type")
            ?.split(";")[0]
            .trim()
            .toLowerCase() !== "text/plain"
        )
          throw new AuthError(
            "MCP_UI_PROBE_UNAVAILABLE",
            "This diagnostic is unavailable.",
            503,
          );
        const bytes = await readLimited(
          response,
          Math.min(manifest.bytes, 700_000),
          controller.signal,
        );
        const digest = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              bytes as Uint8Array<ArrayBuffer>,
            ),
          ),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        if (bytes.length !== manifest.bytes || digest !== manifest.sha256)
          throw new AuthError(
            "MCP_UI_PROBE_UNAVAILABLE",
            "This diagnostic is unavailable.",
            503,
          );
        const html = new TextDecoder().decode(bytes);
        await assertMcpUiProbeCurrent(env, identity);
        return {
          contents: [
            {
              uri: manifest.resourceUri,
              mimeType: RESOURCE_MIME_TYPE,
              text: html,
              _meta: metadata,
            },
          ],
        };
      } catch (error) {
        controller.abort();
        void response?.body?.cancel().catch(() => {});
        throw error instanceof AuthError ? error : unavailable();
      } finally {
        clearTimeout(timeout);
      }
    },
  );
}
