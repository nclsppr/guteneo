import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import mcpUiProbeManifest from "../../../packages/contracts/src/mcp-ui-probe-resource.json";
import type { AuthEnv, McpIdentity } from "./auth";
import {
  assertCurrentMcpAppAuthority,
  selectedMcpAppWindowEnabled,
} from "./mcp-app-activation";
import {
  registerPinnedMcpAppResource,
  type PinnedMcpAppManifest,
} from "./mcp-app-resource";

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

/** This server-owned diagnostic window grants no document or business authority. */
export function mcpUiProbeEnabled(
  env: AuthEnv,
  identity: McpIdentity,
  now = Date.now(),
): boolean {
  return selectedMcpAppWindowEnabled(
    env,
    identity,
    env.MCP_UI_PROBE,
    "documents:read",
    now,
  );
}

/** Reuse normal token/membership/connection verification for cached callbacks. */
export async function assertMcpUiProbeCurrent(
  env: AuthEnv,
  identity: McpIdentity,
): Promise<void> {
  await assertCurrentMcpAppAuthority(
    env,
    identity,
    (current) => mcpUiProbeEnabled(env, current),
    "MCP_UI_PROBE_UNAVAILABLE",
    "This diagnostic is unavailable.",
  );
}

export function registerMcpUiProbeResource(
  server: McpServer,
  env: AuthEnv,
  identity: McpIdentity,
  manifest: PinnedMcpAppManifest,
  assets?: Pick<Fetcher, "fetch">,
): void {
  registerPinnedMcpAppResource(server, env, manifest, {
    title: "Guteneo host diagnostic",
    code: "MCP_UI_PROBE_UNAVAILABLE",
    message: "This diagnostic is unavailable.",
    assertCurrent: () => assertMcpUiProbeCurrent(env, identity),
    assets,
  });
}
