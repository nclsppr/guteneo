import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { buildMcpUiProbeResource } from "../../scripts/build-mcp-ui-probe.mjs";
import { servePublicAssets } from "../../apps/api/src/public-assets";
import previewWorker from "../../apps/preview/src/index";
import type { Env } from "../../apps/api/src/env";
import * as authentication from "../../apps/api/src/auth";
import type { AuthEnv, McpIdentity } from "../../apps/api/src/auth";
import {
  createGuteneoMcpServer,
  type McpServices,
} from "../../apps/api/src/mcp";
import {
  mcpUiProbeEnabled,
  MCP_UI_PROBE_URI,
  MCP_UI_PROBE_ACK,
} from "../../apps/api/src/mcp-ui-probe";

const now = Date.parse("2026-10-26T04:00:00Z");
const names = ["open_mcp_ui_probe", "check_mcp_ui_probe_bridge"];
const { text: resourceText } = await buildMcpUiProbeResource({ check: true });
function fixture() {
  const identity: McpIdentity = {
    context: {
      organizationId: "synthetic-org",
      userId: "synthetic-user",
      role: "viewer",
      actor: "mcp",
    },
    scopes: ["documents:read"],
    clientId: "shared-hosted-client",
    token: "synthetic-not-a-credential",
    expiresAt: now / 1000 + 3600,
    verifiedTokenIssuer: "https://synthetic.auth0.example/",
    connectionObservation: {
      connectionId: "conn_synthetic",
      authorizationRevision: 4,
    },
  };
  const config = {
    enabled: true,
    connectionId: "conn_synthetic",
    authorizationRevision: 4,
    startsAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  };
  const activity = vi.fn(async () => ({}));
  const env = {
    APP_ORIGIN: "https://guteneo.com",
    MODE: "production",
    ENVIRONMENT: "production",
    MCP_UI_PROBE: JSON.stringify(config),
    DB: { prepare: vi.fn(() => ({ bind: () => ({ run: activity }) })) },
  } as unknown as AuthEnv;
  return { identity, config, env, activity };
}
async function connected(
  env: AuthEnv,
  identity: McpIdentity,
  run: (client: Client, forbidden: ReturnType<typeof vi.fn>) => Promise<void>,
  assets = vi.fn(
    async () =>
      new Response(resourceText, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
  ),
) {
  const forbidden = vi.fn(() => {
    throw Error("Business and content services must remain untouched");
  });
  const service = new Proxy(
    {},
    { get: (_target, key) => (key === "then" ? undefined : forbidden) },
  );
  const services = {
    appAssets: {
      fetch: assets,
    },
    domain: service,
    documents: service,
    documentUploads: service,
    capabilities: forbidden,
    onToolFailure: vi.fn(),
  } as unknown as McpServices;
  const server = createGuteneoMcpServer(identity, env, services);
  const client = new Client({ name: "synthetic-probe-host", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    await run(client, forbidden);
  } finally {
    await client.close();
    await server.close();
  }
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("temporary MCP Apps diagnostic", () => {
  it("keeps the public resource inert and existing private/OAuth paths delegated", async () => {
    const { env } = fixture();
    const assets = vi.fn(
      async () =>
        new Response(resourceText, {
          // Public serving must constrain even a wrongly typed upstream asset.
          headers: { "Content-Type": "text/html" },
        }),
    );
    const publicEnv = { ...env, ASSETS: { fetch: assets } } as unknown as Env;
    for (const method of ["GET", "HEAD"]) {
      const response = (await servePublicAssets(
        new Request("https://guteneo.com/mcp-ui-probe/v1.txt", { method }),
        publicEnv,
      ))!;
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/plain; charset=utf-8",
      );
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(await response.text()).toBe(method === "HEAD" ? "" : resourceText);
    }
    assets.mockClear();
    for (const path of [
      "/mcp",
      "/mcp/helper",
      "/oauth/authorize",
      "/api/document-uploads/upl_synthetic/content",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      expect(
        await servePublicAssets(
          new Request("https://guteneo.com" + path),
          publicEnv,
        ),
      ).toBeNull();
    }
    expect(assets).not.toHaveBeenCalled();
    for (const origin of [
      "https://guteneo.com",
      "https://guteneo-preview.example",
    ]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await previewWorker.fetch(
          new Request(origin + "/mcp-ui-probe/v1.txt", { method }),
          publicEnv,
        );
        expect(response.headers.get("Content-Type")).toBe(
          "text/plain; charset=utf-8",
        );
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
        expect(await response.text()).toBe(
          method === "HEAD" ? "" : resourceText,
        );
      }
    }
  });
  it("is absent by default and refuses known direct tool/resource paths", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { env, identity } = fixture();
    delete env.MCP_UI_PROBE;
    await connected(env, identity, async (client, forbidden) => {
      expect(
        (await client.listTools()).tools.some((t) => names.includes(t.name)),
      ).toBe(false);
      for (const name of names)
        await expect(client.callTool({ name, arguments: {} })).rejects.toThrow(
          "not found",
        );
      await expect(
        client.readResource({ uri: MCP_UI_PROBE_URI }),
      ).rejects.toThrow();
      expect(forbidden).not.toHaveBeenCalled();
    });
  });
  it("fails closed on malformed, oversized, future, expired or overly long activation", () => {
    const { env, identity, config } = fixture();
    for (const value of [
      "",
      "{",
      "x".repeat(1025),
      JSON.stringify({ ...config, enabled: false }),
      JSON.stringify({ ...config, extra: "forbidden" }),
      JSON.stringify({ ...config, startsAt: new Date(now + 1).toISOString() }),
      JSON.stringify({ ...config, expiresAt: new Date(now).toISOString() }),
      JSON.stringify({
        ...config,
        expiresAt: new Date(now + 3600_000).toISOString(),
      }),
    ])
      expect(
        mcpUiProbeEnabled({ ...env, MCP_UI_PROBE: value }, identity, now),
      ).toBe(false);
    expect(mcpUiProbeEnabled(env, identity, now)).toBe(true);
  });
  it("binds a current production OAuth connection and revision rather than a shared client ID", () => {
    const { env, identity } = fixture();
    for (const changed of [
      { ...identity, connectionObservation: undefined },
      {
        ...identity,
        connectionObservation: {
          connectionId: "conn_other",
          authorizationRevision: 4,
        },
      },
      {
        ...identity,
        connectionObservation: {
          connectionId: "conn_synthetic",
          authorizationRevision: 5,
        },
      },
      { ...identity, scopes: [] },
      { ...identity, verifiedTokenIssuer: undefined },
      { ...identity, token: "gtn_dev_synthetic" },
      { ...identity, expiresAt: now / 1000 },
    ])
      expect(mcpUiProbeEnabled(env, changed, now)).toBe(false);
    expect(
      mcpUiProbeEnabled({ ...env, MODE: "simulation" }, identity, now),
    ).toBe(false);
    expect(
      mcpUiProbeEnabled(
        { ...env, APP_ORIGIN: "https://other.example" },
        identity,
        now,
      ),
    ).toBe(false);
  });
  it("serves only a bounded SDK resource and constant empty-input bridge, retaining ordinary activity", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { env, identity, activity } = fixture();
    const authenticate = vi
      .spyOn(authentication, "authenticateMcp")
      .mockResolvedValue(identity);
    await connected(env, identity, async (client, forbidden) => {
      const tools = (await client.listTools()).tools.filter((t) =>
        names.includes(t.name),
      );
      expect(tools).toHaveLength(2);
      for (const tool of tools) {
        expect(tool.inputSchema).toMatchObject({
          type: "object",
          additionalProperties: false,
        });
        expect(tool.annotations).toEqual({
          title: tool.title,
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: false,
          idempotentHint: false,
        });
      }
      expect(tools.find((t) => t.name === names[0])?._meta?.ui).toEqual({
        resourceUri: MCP_UI_PROBE_URI,
        visibility: ["model"],
      });
      expect(tools.find((t) => t.name === names[1])?._meta?.ui).toEqual({
        visibility: ["app"],
      });
      const resource = await client.readResource({ uri: MCP_UI_PROBE_URI });
      for (const stale of [
        "ui://guteneo/mcp-ui-probe/v1.html",
        `ui://guteneo/mcp-ui-probe/v1/${"0".repeat(64)}.html`,
      ])
        await expect(client.readResource({ uri: stale })).rejects.toThrow();
      expect(resource.contents[0]).toMatchObject({ text: resourceText });
      expect(resource.contents[0].mimeType).toBe("text/html;profile=mcp-app");
      expect(resource.contents[0]._meta).toMatchObject({
        ui: {
          csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
        },
      });
      const result = await client.callTool({ name: names[1], arguments: {} });
      expect(result.structuredContent).toEqual({
        ok: true,
        data: MCP_UI_PROBE_ACK,
      });
      for (const privateValue of [
        identity.token,
        identity.clientId,
        identity.context.userId,
        identity.context.organizationId,
        "conn_synthetic",
      ])
        expect(JSON.stringify(result) + JSON.stringify(resource)).not.toContain(
          privateValue,
        );
      expect(authenticate).toHaveBeenCalledTimes(3);
      expect(activity).toHaveBeenCalledTimes(1);
      expect(forbidden).not.toHaveBeenCalled();
    });
  });
  it("rejects stale, replaced, truncated and wrongly typed static resource bytes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { env, identity } = fixture();
    vi.spyOn(authentication, "authenticateMcp").mockResolvedValue(identity);
    for (const [text, type] of [
      [resourceText.slice(0, -1), "text/plain"],
      ["X" + resourceText.slice(1), "text/plain"],
      [resourceText + "X", "text/plain"],
      [resourceText, "text/html"],
      [resourceText, "text/plain-invalid"],
    ]) {
      const assets = vi.fn(
        async () => new Response(text, { headers: { "Content-Type": type } }),
      );
      await connected(
        env,
        identity,
        async (client, forbidden) => {
          await expect(
            client.readResource({ uri: MCP_UI_PROBE_URI }),
          ).rejects.toThrow();
          expect(forbidden).not.toHaveBeenCalled();
        },
        assets,
      );
      expect(assets).toHaveBeenCalledOnce();
    }
  });
  it("withholds verified bytes if the activation expires or authority changes during asset loading", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (const change of ["expiry", "revision"] as const) {
      vi.setSystemTime(now);
      const { env, identity } = fixture();
      const authenticate = vi
        .spyOn(authentication, "authenticateMcp")
        .mockResolvedValue(identity);
      const assets = vi.fn(async () => {
        await Promise.resolve();
        if (change === "expiry") vi.setSystemTime(now + 60_000);
        else
          authenticate.mockResolvedValue({
            ...identity,
            connectionObservation: {
              connectionId: "conn_synthetic",
              authorizationRevision: 5,
            },
          });
        return new Response(resourceText, {
          headers: { "Content-Type": "text/plain" },
        });
      });
      await connected(
        env,
        identity,
        async (client, forbidden) => {
          await expect(
            client.readResource({ uri: MCP_UI_PROBE_URI }),
          ).rejects.toThrow();
          expect(forbidden).not.toHaveBeenCalled();
        },
        assets,
      );
      expect(assets).toHaveBeenCalledOnce();
      expect(authenticate).toHaveBeenCalledTimes(change === "expiry" ? 1 : 2);
      authenticate.mockRestore();
    }
  });
  it("bounds the fixed asset fetch itself before any resource is returned", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(now);
    const { env, identity } = fixture();
    vi.spyOn(authentication, "authenticateMcp").mockResolvedValue(identity);
    let requested!: (request: Request) => void;
    const observed = new Promise<Request>((resolve) => {
      requested = resolve;
    });
    const assets = vi.fn((request?: Request) => {
      requested(request!);
      return new Promise<Response>(() => {});
    });
    await connected(
      env,
      identity,
      async (client, forbidden) => {
        const pending = client.readResource({ uri: MCP_UI_PROBE_URI });
        const request = await observed;
        expect(request.url).toBe("https://guteneo.com/mcp-ui-probe/v1.txt");
        const rejection = expect(pending).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(5001);
        await rejection;
        expect(request.signal.aborted).toBe(true);
        expect(forbidden).not.toHaveBeenCalled();
      },
      assets,
    );
  });
  it("cancels a stalled body at the same deadline and an invalid MIME before reading", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(now);
    const { env, identity } = fixture();
    vi.spyOn(authentication, "authenticateMcp").mockResolvedValue(identity);
    for (const type of ["text/plain", "text/html"]) {
      const cancelled = vi.fn();
      let fetched!: () => void;
      const observed = new Promise<void>((resolve) => {
        fetched = resolve;
      });
      const assets = vi.fn(async () => {
        fetched();
        return new Response(new ReadableStream({ cancel: cancelled }), {
          headers: { "Content-Type": type },
        });
      });
      await connected(
        env,
        identity,
        async (client) => {
          const pending = client.readResource({ uri: MCP_UI_PROBE_URI });
          const rejection = expect(pending).rejects.toThrow();
          await observed;
          if (type === "text/plain") await vi.advanceTimersByTimeAsync(5001);
          await rejection;
          expect(cancelled).toHaveBeenCalledOnce();
        },
        assets,
      );
    }
  });
  it("rejects payloads before a callback and rechecks cached callbacks after expiry/revocation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { env, identity } = fixture();
    const authenticate = vi
      .spyOn(authentication, "authenticateMcp")
      .mockResolvedValue(identity);
    await connected(env, identity, async (client, forbidden) => {
      for (const args of [
        { file: "never-read" },
        { base64: "never-read" },
        { url: "https://other.example" },
        { connectionId: "conn_other" },
      ])
        expect(
          (await client.callTool({ name: names[1], arguments: args })).isError,
        ).toBe(true);
      expect(authenticate).not.toHaveBeenCalled();
      authenticate.mockResolvedValue({
        ...identity,
        connectionObservation: {
          connectionId: "conn_synthetic",
          authorizationRevision: 5,
        },
      });
      expect(
        (await client.callTool({ name: names[1], arguments: {} })).isError,
      ).toBe(true);
      await expect(
        client.readResource({ uri: MCP_UI_PROBE_URI }),
      ).rejects.toThrow();
      authenticate.mockResolvedValue(identity);
      vi.setSystemTime(now + 60_000);
      expect(
        (await client.callTool({ name: names[0], arguments: {} })).isError,
      ).toBe(true);
      await expect(
        client.readResource({ uri: MCP_UI_PROBE_URI }),
      ).rejects.toThrow();
      expect(forbidden).not.toHaveBeenCalled();
    });
    await connected(env, identity, async (client) => {
      expect(
        (await client.listTools()).tools.some((t) => names.includes(t.name)),
      ).toBe(false);
    });
  });
});
