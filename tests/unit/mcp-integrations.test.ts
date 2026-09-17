import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  createGuteneoMcpServer,
  type McpDocuments,
  type McpServices,
} from "../../apps/api/src/mcp";
import {
  MCP_SCOPES,
  type AuthEnv,
  type McpIdentity,
} from "../../apps/api/src/auth";
import { ImportSourceError } from "../../apps/api/src/documents";
import { documentAnalysis } from "../../packages/contracts/src/document-analysis";
import { DomainService, type Dispatch } from "../../packages/domain/src/index";

let mf: Miniflare;
let env: AuthEnv;
let domain: DomainService;
let documentId: string;
const identity: McpIdentity = {
  context: {
    organizationId: "org_atelier",
    userId: "user_atelier",
    role: "admin",
    actor: "mcp",
  },
  scopes: [...MCP_SCOPES],
  clientId: "test-plugin",
  token: "test-token-not-a-real-account",
  expiresAt: 0,
};

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "mcp-integrations",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;
  env = {
    DB: db,
    APP_ORIGIN: "http://localhost:8787",
    ENVIRONMENT: "local",
    MODE: "simulation",
  };
  const migrations = (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const filename of [
    ...migrations.map((file) => `migrations/${file}`),
    "scripts/seed.sql",
  ]) {
    const sql = await readFile(
      new URL(`../../${filename}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    for (const rawLine of sql.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("--")) continue;
      if (line.startsWith("CREATE TRIGGER") && !line.endsWith("END;"))
        trigger = true;
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await db.prepare(statement).run();
        statement = "";
        trigger = false;
      }
    }
  }
  domain = new DomainService(db, { mode: "simulation" });
  const document = await domain.registerDocument(identity.context, {
    name: "Original.pdf",
    sha256: "a".repeat(64),
    size: 512,
    pages: 1,
    storageKey: "private-test-document",
    source: "import",
    status: "ready",
  });
  documentId = document.id;
});
afterAll(async () => {
  await mf?.dispose();
});

async function connected<T>(
  run: (client: Client) => Promise<T>,
  principal = identity,
  documentServices: Partial<McpDocuments> = {},
  onToolFailure?: McpServices["onToolFailure"],
) {
  const server = createGuteneoMcpServer(principal, env, {
    domain,
    onToolFailure,
    capabilities: () => ({ mode: "simulation", liveSendsEnabled: false }),
    documents: {
      async importFile() {
        throw new Error("External transfer not exercised");
      },
      async render() {
        throw new Error("Rendering not exercised");
      },
      ...documentServices,
    },
  });
  const client = new Client({
    name: "integration-contract-test",
    version: "1",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}
async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
) {
  return (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ type: string; text?: string }>;
    structuredContent?: {
      ok: boolean;
      data?: Record<string, unknown>;
      error?: { code: string };
    };
    _meta?: Record<string, unknown>;
  };
}

describe("distributable LLM integrations", () => {
  it("keeps automatic analysis readable and resumable without another import or rescan", async () => {
    const saved = await domain.getDocument(identity.context, documentId);
    const processing = {
      ...saved,
      status: "quarantined" as const,
      pages: 0,
      analysis: documentAnalysis(
        "quarantined",
        "processing",
        "scanner_unavailable",
      ),
    };
    const get = vi.fn(async (ctx: typeof identity.context, id: string) => {
      await domain.getDocument(ctx, id);
      return processing;
    });
    const rescan = vi.fn(async () => processing);
    const importFile = vi.fn(async () => processing);
    await connected(
      async (client) => {
        const result = await call(client, "get_document", { documentId });
        expect(result.isError).not.toBe(true);
        const message = result.content[0];
        expect(message.type).toBe("text");
        expect(message.text).toContain("dans cette conversation");
        expect(message.text).not.toMatch(/https?:\/\/|quarantined|doc_/);
        expect(result.structuredContent?.data).toMatchObject({
          id: documentId,
          status: "quarantined",
          documentUrl: `${env.APP_ORIGIN}/#/app/documents?document=${documentId}`,
          analysis: {
            state: "processing",
            nextAction: "wait",
            retryAfterSeconds: 15,
          },
        });
        const analysis = result.structuredContent?.data?.analysis;
        expect(JSON.stringify(analysis)).toContain("automatiquement");
        expect(JSON.stringify(analysis)).not.toContain("quarantined");
        expect(JSON.stringify(result)).not.toContain("private-test-document");
        const listing = await call(client, "list_documents");
        expect(listing.structuredContent?.data?.items).toEqual([
          expect.objectContaining({ analysis: processing.analysis }),
        ]);
        expect(get).toHaveBeenCalledExactlyOnceWith(
          identity.context,
          documentId,
        );
        expect(rescan).not.toHaveBeenCalled();
        expect(importFile).not.toHaveBeenCalled();
      },
      identity,
      {
        get,
        rescan,
        importFile,
        list: async () => ({ items: [processing], nextCursor: null }),
      },
    );
  });

  it("gives an honest recovery action for old quarantine and a distinct permanent refusal", async () => {
    const saved = await domain.getDocument(identity.context, documentId);
    const doc = { ...saved, status: "quarantined" as const, pages: 0 };
    for (const analysis of [
      undefined,
      documentAnalysis("quarantined", "blocked", "security_rejected"),
    ]) {
      await connected(
        async (client) => {
          const result = await call(client, "rescan_document", { documentId });
          expect(result.structuredContent?.data?.analysis).toMatchObject(
            analysis
              ? { state: "blocked", nextAction: "replace_document" }
              : {
                  state: "retryable",
                  nextAction: "rescan",
                  code: "not_started",
                },
          );
          expect(
            JSON.stringify(result.structuredContent?.data?.analysis),
          ).not.toContain("automatiquement");
        },
        identity,
        { rescan: async () => ({ ...doc, ...(analysis ? { analysis } : {}) }) },
      );
    }
  });

  it("returns an actionable import reason and correlation without leaking signed URL details", async () => {
    const correlation = "fcd1cb36-c54b-427a-98b5-19f6f304728a";
    const onFailure = vi.fn(() => correlation);
    await connected(
      async (client) => {
        const result = await client.callTool({
          name: "import_document",
          arguments: {
            file: {
              download_url:
                "https://files.oaiusercontent.com/private-file?signature=private-token",
              file_id: "private-file",
            },
          },
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
          ok: false,
          error: {
            code: "SOURCE_NOT_ALLOWED",
            reason: "missing_configuration",
            sourceHost: "files.oaiusercontent.com",
            correlationId: correlation,
          },
        });
        expect(JSON.stringify(result)).not.toContain("private-file");
        expect(JSON.stringify(result)).not.toContain("private-token");
      },
      identity,
      {
        importFile: async () => {
          throw new ImportSourceError(
            "SOURCE_NOT_ALLOWED",
            "missing_configuration",
            "Configurez le fournisseur de fichiers.",
            "files.oaiusercontent.com",
          );
        },
      },
      onFailure,
    );
    expect(onFailure).toHaveBeenCalledWith("DOMAIN_REJECTED", {
      reason: "missing_configuration",
      sourceCategory: "known_provider",
      knownHost: "files.oaiusercontent.com",
    });
  });

  it("validates official portable schemas and produces identical archives without secrets", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "guteneo-plugins-"));
    try {
      const first = path.join(temp, "a");
      const second = path.join(temp, "b");
      for (const output of [first, second])
        execFileSync(process.execPath, ["integrations/build.mjs", output]);
      const archive = await readFile(path.join(first, "guteneo-plugin.zip"));
      expect(archive).toEqual(
        await readFile(path.join(second, "guteneo-plugin.zip")),
      );
      const manifest = JSON.parse(
        await readFile(path.join(first, "manifest.json"), "utf8"),
      );
      expect(manifest.hostQualification).toBe("pending");
      expect(manifest.publishedToDirectories).toBe(false);
      expect(manifest.files).toContain("skills/fax-pdf/SKILL.md");
      expect(manifest.files).toContain("skills/postal-pdf/SKILL.md");
      const postalSkill = execFileSync(
        "unzip",
        [
          "-p",
          path.join(first, "guteneo-plugin.zip"),
          "skills/postal-pdf/SKILL.md",
        ],
        { encoding: "utf8" },
      );
      expect(postalSkill).toContain("get_capabilities");
      expect(postalSkill).toContain("n’est pas disponible");
      expect(postalSkill).toContain("submission_unknown");
      for (const name of ["copilot-vscode-mcp.json", "copilot-cli-mcp.json"]) {
        const built = await readFile(path.join(first, name), "utf8");
        expect(built).toBe(
          await readFile(
            new URL(`../../apps/web/public/guides/${name}`, import.meta.url),
            "utf8",
          ),
        );
        const config = JSON.parse(built);
        expect(config).toEqual(
          name.includes("vscode")
            ? {
                servers: {
                  guteneo: { type: "http", url: "https://guteneo.com/mcp" },
                },
              }
            : {
                mcpServers: {
                  guteneo: {
                    type: "http",
                    url: "https://guteneo.com/mcp",
                    tools: ["*"],
                  },
                },
              },
        );
      }
      expect(archive.toString()).not.toContain("Bearer ");
      expect(archive.toString()).not.toContain("client_secret");
      expect(archive.toString()).not.toContain("/Users/");
      // Independently parse the produced ZIP and check its CRCs with the OS archive reader.
      const listing = execFileSync(
        "unzip",
        ["-t", path.join(first, "guteneo-plugin.zip")],
        { encoding: "utf8" },
      );
      expect(listing).toContain("No errors detected");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("advertises a scoped exact-file fax workflow with no model approval input", async () => {
    await connected(async (client) => {
      const { tools } = await client.listTools();
      for (const tool of tools)
        expect(tool._meta?.securitySchemes).toMatchObject([{ type: "oauth2" }]);
      const prepare = tools.find((tool) => tool.name === "prepare_fax")!;
      expect(prepare.inputSchema.required).toEqual([
        "documentId",
        "phone",
        "ceilingMinor",
        "idempotencyKey",
      ]);
      expect(prepare.inputSchema.additionalProperties).toBe(false);
      expect(prepare._meta?.securitySchemes).toEqual([
        { type: "oauth2", scopes: ["dispatches:prepare"] },
      ]);
      const importer = tools.find((tool) => tool.name === "import_document")!;
      expect(importer._meta?.["openai/fileParams"]).toEqual(["file"]);
      expect(tools.some((tool) => tool.name === "approve_dispatch")).toBe(
        false,
      );
      expect(tools.some((tool) => tool.name === "rescan_document")).toBe(false);
      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name)).toContain("fax_pdf");
      const prompt = await client.getPrompt({ name: "fax_pdf" });
      expect(JSON.stringify(prompt)).toContain("submission_unknown");
      expect(JSON.stringify(prompt)).toContain(
        "ne remplace pas cette approbation",
      );
    });
  });

  it("returns an OAuth challenge for missing scope without reading another document", async () => {
    await connected(
      async (client) => {
        const denied = await call(client, "get_document", { documentId });
        expect(denied.isError).toBe(true);
        expect(denied.structuredContent?.error?.code).toBe(
          "INSUFFICIENT_SCOPE",
        );
        expect(JSON.stringify(denied._meta)).toContain(
          'scope=\\"documents:read\\"',
        );
        expect(JSON.stringify(denied)).not.toContain("Original.pdf");
      },
      { ...identity, scopes: ["dispatches:read"] },
    );
  });

  it("retrieves a browser-uploaded PDF by metadata while refusing another tenant", async () => {
    await connected(async (client) => {
      const listing = await call(client, "list_documents");
      expect(listing.structuredContent?.data).toMatchObject({
        items: [{ id: documentId, sha256: "a".repeat(64), status: "ready" }],
      });
      expect(JSON.stringify(listing)).not.toContain("private-test-document");
    });
    await connected(
      async (client) => {
        const document = await call(client, "get_document", { documentId });
        expect(document.structuredContent?.error?.code).toBe("NOT_FOUND");
      },
      {
        ...identity,
        context: {
          ...identity.context,
          organizationId: "org_studio",
          userId: "user_studio",
        },
      },
    );
  });

  it("requires documents:write for a rescan even after a client reconnects without that grant", async () => {
    const rescan = vi.fn<NonNullable<McpDocuments["rescan"]>>();
    for (const clientId of ["connected-reader", "relinked-reader"]) {
      await connected(
        async (client) => {
          const denied = await call(client, "rescan_document", { documentId });
          expect(denied.isError).toBe(true);
          expect(denied.structuredContent?.error?.code).toBe(
            "INSUFFICIENT_SCOPE",
          );
          expect(denied._meta?.["mcp/www_authenticate"]).toEqual([
            expect.stringContaining('scope="documents:write"'),
          ]);
          expect(JSON.stringify(denied)).not.toContain("Original.pdf");
          expect(rescan).not.toHaveBeenCalled();
        },
        { ...identity, clientId, scopes: ["documents:read"] },
        { rescan },
      );
    }
  });

  it("exposes a bounded write tool and returns the same private document after an explicitly granted rescan", async () => {
    // The real D1/R2 rescan behavior is covered in document-rescan.test.ts;
    // this exercises its public contract through the official MCP transport.
    const rescan = vi.fn<NonNullable<McpDocuments["rescan"]>>((ctx, id) =>
      domain.getDocument(ctx, id),
    );
    await connected(
      async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find((tool) => tool.name === "rescan_document")!;
        expect(tool.inputSchema.required).toEqual(["documentId"]);
        expect(Object.keys(tool.inputSchema.properties ?? {})).toEqual([
          "documentId",
        ]);
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.annotations).toMatchObject({
          readOnlyHint: false,
          idempotentHint: false,
        });
        expect(tool._meta?.securitySchemes).toEqual([
          { type: "oauth2", scopes: ["documents:write"] },
        ]);
        const invalid = await call(client, "rescan_document", {
          documentId,
          organizationId: "org_studio",
        });
        expect(invalid.isError).toBe(true);
        expect(rescan).not.toHaveBeenCalled();
        const result = await call(client, "rescan_document", { documentId });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          ok: true,
          data: {
            id: documentId,
            sha256: "a".repeat(64),
            status: "ready",
            pages: 1,
            simulation: true,
            previewUrl: `${env.APP_ORIGIN}/api/documents/${documentId}/content`,
          },
        });
        expect(JSON.stringify(result)).not.toContain("private-test-document");
        expect(rescan).toHaveBeenCalledExactlyOnceWith(
          identity.context,
          documentId,
        );
      },
      {
        ...identity,
        clientId: "relinked-writer",
        scopes: ["documents:read", "documents:write"],
      },
      { rescan },
    );
  });

  it("prepares an exact PDF fax, rejects chat approval and reserves once after browser approval", async () => {
    await connected(async (client) => {
      const input = {
        documentId,
        phone: "+33123456789",
        ceilingMinor: 500,
        idempotencyKey: "integration-fax-prepare",
      };
      const prepared = await call(client, "prepare_fax", input);
      expect(prepared.isError).not.toBe(true);
      const dispatch = prepared.structuredContent!.data!;
      expect(dispatch).toMatchObject({
        channel: "fax",
        documentId,
        status: "prepared",
        mode: "simulation",
        recipient: { phone: "+33123456789" },
      });
      expect(dispatch.approvalUrl).toBe(
        `${env.APP_ORIGIN}/#/app/dispatch/${dispatch.id}`,
      );
      const duplicate = await call(client, "prepare_fax", input);
      expect(duplicate.structuredContent?.data?.id).toBe(dispatch.id);
      const rejected = await call(client, "prepare_fax", {
        ...input,
        user_confirmed: true,
      });
      expect(rejected.isError).toBe(true);
      const confirmation = {
        dispatchId: dispatch.id,
        idempotencyKey: "integration-fax-confirm",
      };
      const premature = await call(client, "confirm_dispatch", confirmation);
      expect(premature.structuredContent?.error?.code).toBe(
        "APPROVAL_REQUIRED",
      );
      const human = { ...identity.context, actor: "browser" as const };
      await domain.approveDispatch(
        human,
        String(dispatch.id),
        String(dispatch.fingerprint),
      );
      const results = await Promise.all([
        call(client, "confirm_dispatch", confirmation),
        call(client, "confirm_dispatch", confirmation),
      ]);
      for (const result of results)
        expect(result.structuredContent?.data?.status).toBe("queued");
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM outbox WHERE organization_id=? AND dispatch_id=?",
      )
        .bind(identity.context.organizationId, dispatch.id)
        .first<{ count: number }>();
      expect(count?.count).toBe(1);
      const current = (
        await domain.getDispatch(identity.context, String(dispatch.id))
      ).dispatch as Dispatch;
      expect(current.document_id).toBe(documentId);
    });
  });

  it.each([
    { phone: "01 23 45 67 89", ceilingMinor: 500 },
    { phone: "+33123456789", ceilingMinor: 1.2 },
    { phone: "+33123456789", ceilingMinor: -1 },
  ])(
    "rejects ambiguous destination or invalid monetary ceiling: %j",
    async (invalid) => {
      await connected(async (client) => {
        const result = await call(client, "prepare_fax", {
          documentId,
          idempotencyKey: "invalid-fax",
          ...invalid,
        });
        expect(result.isError).toBe(true);
      });
    },
  );
});
