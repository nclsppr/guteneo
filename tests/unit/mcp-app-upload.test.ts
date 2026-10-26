import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentError } from "../../packages/contracts/src/content";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { buildMcpDocumentUploadResource } from "../../scripts/build-mcp-document-upload.mjs";
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
  mcpDocumentUploadEnabled,
  MCP_DOCUMENT_UPLOAD_URI,
} from "../../apps/api/src/mcp-document-upload";
import type { McpAppUploadView } from "../../packages/contracts/src/mcp-app-upload";

const now = Date.parse("2026-10-26T06:00:00Z");
const names = [
  "open_mcp_document_upload",
  "begin_mcp_document_upload",
  "append_mcp_document_upload",
  "get_mcp_document_upload",
  "finish_mcp_document_upload",
  "cancel_mcp_document_upload",
];
const { text: resourceText } = await buildMcpDocumentUploadResource({
  check: true,
});
function fixture() {
  const identity: McpIdentity = {
    context: {
      organizationId: "synthetic-org",
      userId: "synthetic-user",
      role: "member",
      actor: "mcp",
    },
    scopes: ["documents:write"],
    clientId: "shared-hosted-client",
    token: "synthetic-not-a-credential",
    expiresAt: now / 1000 + 3600,
    verifiedTokenIssuer: "https://synthetic.auth0.example/",
    connectionObservation: {
      connectionId: "conn_original",
      authorizationRevision: 4,
    },
  };
  const activity = vi.fn(async () => ({}));
  const preference = vi.fn(async () => ({ preferred_locale: "fr" }));
  const env = {
    APP_ORIGIN: "https://guteneo.com",
    MODE: "production",
    ENVIRONMENT: "production",
    MCP_DOCUMENT_UPLOAD_APP: "enabled",
    DB: {
      prepare: vi.fn(() => ({
        bind: () => ({ run: activity, first: preference }),
      })),
    },
  } as unknown as AuthEnv;
  const view: McpAppUploadView = {
    uploadId: "upl_00000000-0000-4000-8000-000000000000",
    status: "receiving",
    expiresAt: new Date(now + 300000).toISOString(),
    partSize: 262144,
    partCount: 2,
    confirmedParts: [],
    receivedBytes: 0,
    remainingCalls: 63,
    nextAction: "append_part",
  };
  const methods = {
    begin: vi.fn(async () => view),
    append: vi.fn(async () => view),
    get: vi.fn(async () => view),
    finish: vi.fn(async () => view),
    cancel: vi.fn(async () => view),
  };
  return { env, identity, activity, preference, view, methods };
}
async function connected(
  f: ReturnType<typeof fixture>,
  run: (client: Client) => Promise<void>,
  assets = vi.fn(
    async () =>
      new Response(resourceText, { headers: { "Content-Type": "text/plain" } }),
  ),
) {
  const forbidden = vi.fn(() => {
    throw new Error("Unrelated business service invoked");
  });
  const service = new Proxy(
    {},
    { get: (_target, key) => (key === "then" ? undefined : forbidden) },
  );
  const services = {
    domain: service,
    documents: service,
    documentUploads: service,
    appDocumentUploads: f.methods,
    appAssets: { fetch: assets },
    capabilities: forbidden,
  } as unknown as McpServices;
  const server = createGuteneoMcpServer(f.identity, f.env, services);
  const client = new Client({
    name: "synthetic-original-app-host",
    version: "1",
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    await run(client);
    expect(forbidden).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await server.close();
  }
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("private original MCP App surface", () => {
  it("keeps the public shell inert on live and preview without touching a business API", async () => {
    const f = fixture();
    const assets = vi.fn(
      async () =>
        new Response(resourceText, {
          headers: { "Content-Type": "text/html" },
        }),
    );
    const env = { ...f.env, ASSETS: { fetch: assets } } as unknown as Env;
    for (const method of ["GET", "HEAD"]) {
      const request = new Request(
        "https://guteneo.com/mcp-document-upload/v1.txt",
        { method },
      );
      for (const response of [
        (await servePublicAssets(request, env))!,
        await previewWorker.fetch(request, env),
      ]) {
        expect(response.status).toBe(200);
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
  it("requires a verified current production writer and an explicit reviewed activation", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { env, identity } = fixture();
    expect(mcpDocumentUploadEnabled(env, identity)).toBe(true);
    for (const flag of [undefined, "true", "false", "{}", "x".repeat(1025)])
      expect(
        mcpDocumentUploadEnabled(
          { ...env, MCP_DOCUMENT_UPLOAD_APP: flag },
          identity,
        ),
      ).toBe(false);
    for (const invalid of [
      { ...identity, scopes: ["documents:read"] },
      { ...identity, token: "gtn_dev_fixture" },
      { ...identity, expiresAt: now / 1000 },
      { ...identity, verifiedTokenIssuer: undefined },
      { ...identity, connectionObservation: undefined },
      {
        ...identity,
        context: { ...identity.context, role: "viewer" as const },
      },
      {
        ...identity,
        context: { ...identity.context, actor: "browser" as const },
      },
    ])
      expect(mcpDocumentUploadEnabled(env, invalid)).toBe(false);
    for (const patch of [
      { MODE: "simulation" },
      { ENVIRONMENT: "local" },
      { APP_ORIGIN: "https://other.example" },
    ])
      expect(mcpDocumentUploadEnabled({ ...env, ...patch }, identity)).toBe(
        false,
      );
    for (const role of ["admin", "supervisor", "member"] as const)
      expect(
        mcpDocumentUploadEnabled(env, {
          ...identity,
          context: { ...identity.context, role },
        }),
      ).toBe(true);
  });
  it("bounds qualification to the exact connection revision and canonical one-hour window", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { env, identity } = fixture();
    const window = {
      enabled: true,
      connectionId: "conn_original",
      authorizationRevision: 4,
      startsAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 60000).toISOString(),
    };
    const enabled = (patch: Record<string, unknown>) =>
      mcpDocumentUploadEnabled(
        {
          ...env,
          MCP_DOCUMENT_UPLOAD_APP: JSON.stringify({ ...window, ...patch }),
        },
        identity,
      );
    expect(enabled({})).toBe(true);
    for (const patch of [
      { connectionId: identity.clientId },
      { authorizationRevision: 5 },
      { extra: true },
      { startsAt: new Date(now + 1000).toISOString() },
      { expiresAt: new Date(now).toISOString() },
      { expiresAt: new Date(now + 3600000).toISOString() },
      { enabled: false },
    ])
      expect(enabled(patch)).toBe(false);
  });
  it("omits every new tool and resource when off, even with a known URI or shared client", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const f = fixture();
    delete f.env.MCP_DOCUMENT_UPLOAD_APP;
    await connected(f, async (client) => {
      expect(
        (await client.listTools()).tools.some((t) => names.includes(t.name)),
      ).toBe(false);
      for (const name of names)
        await expect(client.callTool({ name, arguments: {} })).rejects.toThrow(
          "not found",
        );
      await expect(
        client.readResource({ uri: MCP_DOCUMENT_UPLOAD_URI }),
      ).rejects.toThrow();
    });
    for (const method of Object.values(f.methods))
      expect(method).not.toHaveBeenCalled();
  });
  it("presents one model tool, five App-only tools and the pinned network-free resource", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const f = fixture();
    vi.spyOn(authentication, "authenticateMcp").mockResolvedValue(f.identity);
    await connected(f, async (client) => {
      const tools = (await client.listTools()).tools.filter((t) =>
        names.includes(t.name),
      );
      expect(tools).toHaveLength(6);
      for (const tool of tools) {
        expect(tool._meta).toMatchObject({
          ui: { visibility: [tool.name === names[0] ? "model" : "app"] },
        });
        expect(tool.annotations).toMatchObject({
          readOnlyHint: false,
          destructiveHint: tool.name !== names[0],
          idempotentHint: false,
          openWorldHint: false,
        });
      }
      const opened = await client.callTool({ name: names[0], arguments: {} });
      expect(opened.structuredContent).toMatchObject({
        ok: true,
        data: {
          surface: "guteneo-private-original-v1",
          locale: "fr",
          limits: {
            maxBytes: 10485760,
            partBytes: 262144,
            maxParts: 40,
            maxCalls: 64,
            expiresWithinSeconds: 300,
          },
        },
      });
      const resource = await client.readResource({
        uri: MCP_DOCUMENT_UPLOAD_URI,
      });
      expect(resource.contents[0]).toMatchObject({
        text: resourceText,
        mimeType: "text/html;profile=mcp-app",
        _meta: {
          ui: {
            csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
          },
        },
      });
      for (const secret of [
        f.identity.token,
        f.identity.clientId,
        f.identity.context.userId,
        f.identity.context.organizationId,
        "conn_original",
      ])
        expect(JSON.stringify(resource) + JSON.stringify(opened)).not.toContain(
          secret,
        );
    });
    for (const method of Object.values(f.methods))
      expect(method).not.toHaveBeenCalled();
  });
  it("rejects unexpected metadata and oversize parts before any storage callback", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const f = fixture();
    const authenticate = vi
      .spyOn(authentication, "authenticateMcp")
      .mockResolvedValue(f.identity);
    await connected(f, async (client) => {
      for (const [name, args] of [
        [names[0], { file: "not-readable" }],
        [
          names[1],
          {
            idempotencyKey: "test_original",
            fileName: "sample.pdf",
            size: 10485761,
            sha256: "a".repeat(64),
          },
        ],
        [
          names[2],
          {
            uploadId: f.view.uploadId,
            partIndex: 40,
            base64: "YQ==",
            sha256: "a".repeat(64),
          },
        ],
        [
          names[2],
          {
            uploadId: f.view.uploadId,
            partIndex: 0,
            base64: "A".repeat(349529),
            sha256: "a".repeat(64),
          },
        ],
        [names[3], { uploadId: f.view.uploadId, organizationId: "other" }],
      ] as const)
        expect((await client.callTool({ name, arguments: args })).isError).toBe(
          true,
        );
    });
    expect(authenticate).not.toHaveBeenCalled();
    for (const method of Object.values(f.methods))
      expect(method).not.toHaveBeenCalled();
  });
  it("keeps error recovery inside the existing App instead of binary upload tools", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const f = fixture();
    vi.spyOn(authentication, "authenticateMcp").mockResolvedValue(f.identity);
    f.methods.get.mockRejectedValue(
      new ContentError(
        "APP_PART_UNCONFIRMED",
        "Read the same part status.",
        409,
      ),
    );
    await connected(f, async (client) => {
      const result = await client.callTool({
        name: "get_mcp_document_upload",
        arguments: { uploadId: f.view.uploadId },
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: false,
        error: {
          recovery: {
            action: "check_document_upload",
            tool: null,
            retry: "read_only",
          },
        },
      });
      const text = JSON.stringify(result);
      expect(text).toContain("Check status in the existing Guteneo PDF App");
      expect(text).not.toMatch(/begin_document_upload|get_document_upload/);
      expect(f.methods.get).toHaveBeenCalledOnce();
    });
  });
  it("reauthenticates cached callbacks and refuses removed activation, changed authority or revision", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const f = fixture();
    const authenticate = vi
      .spyOn(authentication, "authenticateMcp")
      .mockResolvedValue(f.identity);
    await connected(f, async (client) => {
      for (const patch of [
        {
          ...f.identity,
          context: { ...f.identity.context, role: "viewer" as const },
        },
        {
          ...f.identity,
          context: { ...f.identity.context, role: "admin" as const },
        },
        {
          ...f.identity,
          connectionObservation: {
            connectionId: "conn_original",
            authorizationRevision: 5,
          },
        },
        {
          ...f.identity,
          context: { ...f.identity.context, organizationId: "other" },
        },
      ]) {
        authenticate.mockResolvedValue(patch);
        expect(
          (
            await client.callTool({
              name: names[3],
              arguments: { uploadId: f.view.uploadId },
            })
          ).isError,
        ).toBe(true);
        await expect(
          client.readResource({ uri: MCP_DOCUMENT_UPLOAD_URI }),
        ).rejects.toThrow();
      }
      authenticate.mockResolvedValue(f.identity);
      delete f.env.MCP_DOCUMENT_UPLOAD_APP;
      expect(
        (
          await client.callTool({
            name: names[5],
            arguments: { uploadId: f.view.uploadId },
          })
        ).isError,
      ).toBe(true);
      await expect(
        client.readResource({ uri: MCP_DOCUMENT_UPLOAD_URI }),
      ).rejects.toThrow();
    });
    for (const method of Object.values(f.methods))
      expect(method).not.toHaveBeenCalled();
  });
});
