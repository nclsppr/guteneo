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
  MCP_LIMITS,
  type McpDocuments,
  type McpServices,
} from "../../apps/api/src/mcp";
import {
  MCP_SCOPES,
  hashSecret,
  type AuthEnv,
  type McpIdentity,
} from "../../apps/api/src/auth";
import { ImportSourceError } from "../../apps/api/src/documents";
import { documentAnalysis } from "../../packages/contracts/src/document-analysis";
import {
  assistantRecovery,
  assistantRecoverySchema,
} from "../../packages/contracts/src/assistant-recovery";
import { ContentError } from "../../packages/contracts/src/content";
import { GUTENEO_VERSION } from "../../packages/contracts/src/release";
import {
  prepareTemplateRender,
  validateTemplateEnvelope,
} from "../../packages/contracts/src/templates";
import {
  DomainError,
  DomainService,
  type Dispatch,
} from "../../packages/domain/src/index";

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
  postal?: McpServices["postal"],
  workflow?: McpServices["workflow"],
) {
  const server = createGuteneoMcpServer(principal, env, {
    domain,
    onToolFailure,
    postal,
    workflow,
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
      error?: { code: string; recovery?: unknown };
    };
    _meta?: Record<string, unknown>;
  };
}

describe("distributable LLM integrations", () => {
  it("describes both existing JSON dataset root shapes without rewriting their original data", async () => {
    const importDataset = vi.fn(async () => {
      throw new DomainError(
        "SYNTHETIC_REACHED",
        "Synthetic validation boundary",
      );
    });
    const inputs = [
      [{ customer: { name: "Example" }, count: 2, enabled: true, note: null }],
      { Customers: [{ customer: "Example" }], Items: [{ amount: "1.25" }] },
    ];
    await connected(
      async (client) => {
        const tool = (await client.listTools()).tools.find(
          (item) => item.name === "import_json_dataset",
        )!;
        expect(tool.inputSchema.properties?.data).toEqual({
          type: ["array", "object"],
          items: { type: "object" },
          additionalProperties: {
            type: "array",
            items: { type: "object" },
          },
        });
        for (const data of inputs) {
          const result = await call(client, "import_json_dataset", {
            name: "Synthetic records",
            data,
          });
          expect(result.structuredContent?.error?.code).toBe(
            "SYNTHETIC_REACHED",
          );
          expect(importDataset).toHaveBeenLastCalledWith(
            expect.objectContaining({
              organizationId: identity.context.organizationId,
            }),
            {
              name: "Synthetic records",
              format: "json",
              bytes: new TextEncoder().encode(JSON.stringify(data)),
            },
          );
        }
      },
      identity,
      {},
      undefined,
      undefined,
      { importDataset } as unknown as McpServices["workflow"],
    );
  });

  it("preserves the supported 100,000-cell JSON dataset before domain validation", async () => {
    const importDataset = vi.fn(async () => {
      throw new DomainError(
        "SYNTHETIC_REACHED",
        "Synthetic validation boundary",
      );
    });
    const data = Array.from({ length: 5000 }, (_, row) =>
      Object.fromEntries(
        Array.from({ length: 20 }, (_, column) => [`field${column}`, row]),
      ),
    );
    expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThan(
      MCP_LIMITS.requestBytes,
    );
    await connected(
      async (client) => {
        const result = await call(client, "import_json_dataset", {
          name: "Synthetic cells",
          data,
        });
        expect(result.structuredContent?.error?.code).toBe("SYNTHETIC_REACHED");
        expect(importDataset).toHaveBeenCalledTimes(1);
      },
      identity,
      {},
      undefined,
      undefined,
      { importDataset } as unknown as McpServices["workflow"],
    );
  });

  it("rejects excessive tool argument elements before validation or document access", async () => {
    const importFile = vi.fn(async () => {
      throw new Error("A rejected call must not reach document services");
    });
    await connected(
      async (client) => {
        const result = await call(client, "import_document", {
          file: {
            download_url: "https://files.example.invalid/original.pdf",
            file_id: "fixture",
          },
          excessive: Array.from(
            { length: MCP_LIMITS.toolInputElements },
            () => null,
          ),
        });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result)).toMatch(/element|limit|complex|large/i);
        expect(importFile).not.toHaveBeenCalled();
      },
      identity,
      { importFile },
    );
  });

  it.each([
    ["DOCUMENT_INTEGRITY_ERROR", "contact_support", null],
    ["CORRUPT_PDF", "replace_file", null],
    ["EXPERT_REVIEW_INVALID", "check_dispatch", "get_dispatch_status"],
    ["EXPERT_REVIEW_EXPIRED", "check_dispatch", "get_dispatch_status"],
  ])(
    "keeps %s recovery actionable without authorizing another send",
    async (code, action, tool) => {
      const importFile = vi.fn(async () => {
        throw new ContentError(code!, "Cette opération est bloquée.");
      });
      await connected(
        async (client) => {
          const result = await call(client, "import_document", {
            file: {
              download_url: "https://files.example.invalid/original.pdf",
              file_id: "fixture",
            },
          });
          expect(result.isError).toBe(true);
          expect(result.structuredContent).toMatchObject({
            ok: false,
            error: { code, recovery: { action, tool } },
          });
          expect(result.content[0].text).toContain(
            "Cette opération est bloquée.",
          );
          expect(result.content[0].text).not.toMatch(
            /approvalUrl|https?:\/\/|approve_and_send_dispatch|confirm_dispatch/,
          );
          expect(importFile).toHaveBeenCalledTimes(1);
        },
        identity,
        { importFile },
      );
    },
  );
  it.each([
    "LIVE_QUOTE_INVALID",
    "FAX_QUOTE_RENEWAL_UNSAFE",
    "RENEWAL_CONTENT_MISMATCH",
    "QUOTE_STILL_VALID",
  ])(
    "exposes a status-first recovery for linked renewal refusal %s",
    async (code) => {
      const renew = vi
        .spyOn(domain, "renewFaxQuote")
        .mockRejectedValue(
          new DomainError(
            code,
            "Le renouvellement exige une vérification.",
            409,
          ),
        );
      const prepare = vi.spyOn(domain, "prepareDispatch");
      const confirm = vi.spyOn(domain, "confirmDispatch");
      try {
        await connected(async (client) => {
          const { tools } = await client.listTools();
          const tool = tools.find((item) => item.name === "prepare_fax")!;
          expect(tool.inputSchema.properties?.renewalOf).toMatchObject({
            type: "string",
          });
          expect(tool.inputSchema.required).not.toContain("renewalOf");
          expect(tool.inputSchema.additionalProperties).toBe(false);
          const result = await call(client, "prepare_fax", {
            documentId,
            phone: "+33123456789",
            ceilingMinor: 500,
            renewalOf: "dsp_initial_quote",
            idempotencyKey: "linked-renewal-recovery",
          });
          expect(result.isError).toBe(true);
          expect(result.structuredContent?.error?.code).toBe(code);
          expect(
            assistantRecoverySchema.parse(
              result.structuredContent?.error?.recovery,
            ),
          ).toMatchObject({
            action: "check_dispatch",
            tool: "get_dispatch_status",
            retry: "never_resend",
          });
          expect(renew).toHaveBeenCalledExactlyOnceWith(
            identity.context,
            "dsp_initial_quote",
            { documentId, phone: "+33123456789", ceilingMinor: 500 },
          );
          expect(prepare).not.toHaveBeenCalled();
          expect(confirm).not.toHaveBeenCalled();
        });
      } finally {
        renew.mockRestore();
        prepare.mockRestore();
        confirm.mockRestore();
      }
    },
  );

  it("requires explicit renewal eligibility while keeping standalone reads independent", () => {
    for (const code of [
      "LIVE_QUOTE_INVALID",
      "EXPERT_REVIEW_INVALID",
      "EXPERT_REVIEW_EXPIRED",
    ]) {
      const recovery = assistantRecoverySchema.parse(assistantRecovery(code));
      for (const prerequisite of [
        "status=prepared",
        "attemptCount=0",
        "renewalOf=the previous dispatchId",
        "documentId, E.164 phone and ceilingMinor",
      ])
        expect(recovery.message).toContain(prerequisite);
    }
    for (const code of [
      "LIVE_QUOTE_INVALID",
      "EXPERT_REVIEW_INVALID",
      "EXPERT_REVIEW_EXPIRED",
      "FAX_QUOTE_RENEWAL_UNSAFE",
      "RENEWAL_CONTENT_MISMATCH",
      "QUOTE_STILL_VALID",
    ])
      expect(
        assistantRecoverySchema.parse(
          assistantRecovery(code, "read_document_pages"),
        ),
      ).toMatchObject({
        action: "read_same_document",
        tool: "read_document_pages",
        retry: "after_change",
      });
  });

  it.each([
    "REVIEW_RENDER_FAILED",
    "REVIEW_RENDER_TIMEOUT",
    "RENDERER_NOT_CONFIGURED",
    "EXPERT_DOCUMENT_UNAVAILABLE",
    "EXPERT_DOCUMENT_TOO_LARGE",
    "REVIEW_IMAGE_BUDGET",
    "REVIEW_RESULT_SIZE",
    "INTERNAL_ERROR",
  ])("keeps standalone page recovery on the same PDF for %s", async (code) => {
    const token = `gtn_dev_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await env.DB.prepare(
      "INSERT INTO development_mcp_tokens(token_hash,user_id,organization_id,expires_at) VALUES(?,?,?,?)",
    )
      .bind(
        await hashSecret(token),
        identity.context.userId,
        identity.context.organizationId,
        expiresAt,
      )
      .run();
    const reader = {
      ...identity,
      clientId: "local-simulation",
      token,
      expiresAt: Date.parse(expiresAt) / 1000,
    };
    const getReviewPages = vi.fn(async () => {
      if (code === "INTERNAL_ERROR")
        throw new Error("private renderer diagnostic");
      throw new ContentError(code, "La lecture de ces pages n’a pas abouti.");
    });
    await connected(
      async (client) => {
        const result = await call(client, "read_document_pages", {
          documentId,
          page: 1,
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
          error: {
            code,
            recovery: {
              action: "read_same_document",
              tool: "read_document_pages",
              retry: "after_change",
            },
          },
        });
        const error = result.structuredContent?.error as
          { recovery: unknown } | undefined;
        const recovery = assistantRecoverySchema.parse(error?.recovery);
        expect(recovery.message).toContain("same documentId and page");
        expect(recovery.message).toContain(
          "neither a prepared dispatch nor an expert mandate",
        );
        expect(recovery.message).not.toContain("review_dispatch");
        expect(JSON.stringify(result)).not.toContain("get_dispatch_status");
        expect(JSON.stringify(result)).not.toContain(
          "private renderer diagnostic",
        );
        expect(
          result.content.filter((item) => item.type === "image"),
        ).toHaveLength(0);
        expect(getReviewPages).toHaveBeenCalledExactlyOnceWith(
          identity.context,
          documentId,
          1,
          undefined,
        );
      },
      reader,
      { getReviewPages },
    );
    if (code !== "INTERNAL_ERROR")
      expect(assistantRecovery(code)).toMatchObject({
        action: "review_same_dispatch",
        tool: "review_dispatch",
        retry: "after_change",
      });
    else
      expect(assistantRecovery(code)).toMatchObject({
        action: "check_dispatch",
        tool: "get_dispatch_status",
        retry: "never_resend",
      });
  });

  it("preserves authentication and integrity recovery ahead of standalone page retry", () => {
    for (const code of [
      "CONNECTION_REVOKED",
      "TOKEN_INVALID",
      "POSTAL_AUTHORITY_CHANGED",
    ])
      expect(assistantRecovery(code, "read_document_pages")).toMatchObject({
        action: "reconnect",
        tool: null,
        retry: "after_change",
      });
    expect(
      assistantRecovery("DOCUMENT_INTEGRITY_ERROR", "read_document_pages"),
    ).toMatchObject({ action: "contact_support", tool: null });
  });

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
        expect(message.text).toContain("in this conversation");
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
        expect(JSON.stringify(analysis)).toContain("automatically");
        expect(JSON.stringify(analysis)).not.toContain("quarantined");
        expect(JSON.stringify(result)).not.toContain("private-test-document");
        const listing = await call(client, "list_documents");
        expect(listing.structuredContent?.data?.items).toEqual([
          expect.objectContaining({ analysis: processing.analysis }),
        ]);
        expect(get).toHaveBeenCalledExactlyOnceWith(
          identity.context,
          documentId,
          undefined,
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
          ).not.toContain("automatically");
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
            reason: "invalid_scheme",
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
            "invalid_scheme",
            "Utilisez un lien HTTPS public direct.",
            "files.oaiusercontent.com",
          );
        },
      },
      onFailure,
    );
    expect(onFailure).toHaveBeenCalledWith("DOMAIN_REJECTED", {
      reason: "invalid_scheme",
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
      const plugin = JSON.parse(
        execFileSync(
          "unzip",
          ["-p", path.join(first, "guteneo-plugin.zip"), "plugin.json"],
          { encoding: "utf8" },
        ),
      );
      expect(manifest.version).toBe(GUTENEO_VERSION);
      expect(manifest.mcpSourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.files).toContain("mcp-contract.json");
      const contract = JSON.parse(
        execFileSync(
          "unzip",
          ["-p", path.join(first, "guteneo-plugin.zip"), "mcp-contract.json"],
          { encoding: "utf8" },
        ),
      );
      expect(contract.pluginVersion).toBe(manifest.version);
      expect(contract.mcpSourceSha256).toBe(manifest.mcpSourceSha256);
      expect(manifest.version).toBe(plugin.version);
      const mcp = JSON.parse(
        execFileSync(
          "unzip",
          ["-p", path.join(first, "guteneo-plugin.zip"), "mcp.json"],
          { encoding: "utf8" },
        ),
      );
      const oauth = mcp.mcpServers.guteneo.extensions["com.openai"].auth;
      expect(oauth.client).toEqual({
        mode: "provided",
        clientId: "BQKAoIP92KVj7E47io4QUxj9mY7puduZ",
        tokenEndpointAuthMethod: "none",
      });
      expect([...oauth.baseScopes].sort()).toEqual([...MCP_SCOPES].sort());
      expect(oauth.defaultScopes).toEqual(["openid", "email", "profile"]);
      expect(oauth.authorizationServerBase).toBe("https://auth.guteneo.com/");
      expect(oauth.authorizationUrl).toBe("https://auth.guteneo.com/authorize");
      expect(oauth.tokenUrl).toBe("https://auth.guteneo.com/oauth/token");
      expect(oauth.resource).toBe("https://guteneo.com/mcp");
      expect(oauth).not.toHaveProperty("clientSecret");
      expect(oauth.client).not.toHaveProperty("clientSecret");
      expect(plugin.name).toBe("guteneo");
      expect(manifest.hostQualification).toBe("pending");
      expect(manifest.publishedToDirectories).toBe(false);
      expect(manifest.files).toContain("skills/email/SKILL.md");
      expect(manifest.files).toContain("skills/pdf-accessibility/SKILL.md");
      expect(manifest.files).toContain("skills/fax-pdf/SKILL.md");
      expect(manifest.files).toContain("skills/postal-pdf/SKILL.md");
      expect(manifest.files).toContain("skills/secure-distribution/SKILL.md");
      expect(manifest.files).toContain(
        "skills/secure-distribution/agents/openai.yaml",
      );
      const secureSkill = execFileSync(
        "unzip",
        [
          "-p",
          path.join(first, "guteneo-plugin.zip"),
          "skills/secure-distribution/SKILL.md",
        ],
        { encoding: "utf8" },
      );
      for (const tool of [
        "prepare_secure_distribution",
        "list_secure_distributions",
        "get_secure_distribution",
        "confirm_secure_distribution",
        "revoke_secure_distribution",
      ])
        expect(secureSkill).toContain(tool);
      expect(secureSkill).toContain("non-refundable");
      expect(secureSkill).toContain("expert mandate");
      const branding = plugin.extensions["com.openai"].interface;
      expect(branding.supportURL).toBe("https://guteneo.com/support/?lang=en");
      expect(branding.privacyPolicyURL).toBe(
        "https://guteneo.com/privacy/?lang=en",
      );
      expect(branding.termsOfServiceURL).toBe(
        "https://guteneo.com/terms/?lang=en",
      );
      expect(branding.shortDescription.length).toBeLessThanOrEqual(30);
      expect(new Set(branding.defaultPrompt).size).toBe(
        branding.defaultPrompt.length,
      );
      for (const prompt of branding.defaultPrompt) {
        expect(prompt.length).toBeLessThanOrEqual(128);
        expect(prompt).not.toContain("@");
      }
      const onboarding = plugin.extensions[
        "com.openai"
      ].onboardingSkill.replace(/^\.\//, "");
      expect(manifest.files).toContain(onboarding);
      // Private reviewer access and legal consent must remain outside the public ZIP.
      expect(plugin.extensions["com.openai"].review).not.toHaveProperty(
        "test_credentials",
      );
      expect(plugin.extensions["com.openai"].review).not.toHaveProperty(
        "reviewer_instructions",
      );
      for (const [property, filename] of [
        ["composerIcon", "guteneo-composer.png"],
        ["logo", "guteneo-mark.png"],
      ]) {
        const asset = branding[property].replace(/^\.\//, "");
        expect(manifest.files).toContain(asset);
        expect(
          execFileSync("unzip", [
            "-p",
            path.join(first, "guteneo-plugin.zip"),
            asset,
          ]),
        ).toEqual(
          await readFile(
            new URL(`../../apps/web/public/brand/${filename}`, import.meta.url),
          ),
        );
      }
      const emailSkill = execFileSync(
        "unzip",
        ["-p", path.join(first, "guteneo-plugin.zip"), "skills/email/SKILL.md"],
        { encoding: "utf8" },
      );
      expect(emailSkill).toContain("prepare_dispatch");
      expect(emailSkill).toContain("My documents");
      expect(emailSkill).toContain("protected_link remains an explicit legacy");
      expect(emailSkill).toContain("never retrieve it with tools");
      expect(emailSkill).toContain("Preparation-only accounts cannot send");
      expect(emailSkill).toContain(
        "Unknown provider outcomes require reconciliation",
      );
      expect(manifest.files).toContain("skills/document-studio/SKILL.md");
      const authoringPath =
        "skills/document-studio/references/template-authoring.md";
      expect(manifest.files).toContain(authoringPath);
      const authoringReference = execFileSync(
        "unzip",
        ["-p", path.join(first, "guteneo-plugin.zip"), authoringPath],
        { encoding: "utf8" },
      );
      expect(authoringReference).toContain("get_template_authoring_guide");
      expect(authoringReference).toContain("get_template_example");
      expect(authoringReference).toContain("delete_template");
      const example = authoringReference.match(/```json\n([\s\S]*?)\n```/);
      expect(example).not.toBeNull();
      const creation = JSON.parse(example![1]);
      const envelope = validateTemplateEnvelope(creation.envelope);
      expect(
        prepareTemplateRender(envelope, envelope.sampleData).inputs,
      ).toHaveLength(1);
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
      expect(postalSkill).toContain("if unavailable");
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
        "neither replaces that approval",
      );
    });
  });

  it("exposes accurate action labels for every tool through the MCP transport", async () => {
    const unused = vi.fn(async () => {
      throw new Error("Tool discovery must not execute an operation");
    });
    await connected(
      async (client) => {
        expect(client.getServerVersion()).toMatchObject({
          name: "guteneo",
          title: "Guteneo",
          version: GUTENEO_VERSION,
          websiteUrl: `${env.APP_ORIGIN}/developers/?lang=en`,
          icons: [
            {
              src: `${env.APP_ORIGIN}/brand/guteneo-mark.png`,
              mimeType: "image/png",
              sizes: ["512x512"],
            },
          ],
        });
        const { tools } = await client.listTools();
        // Read-only, destructive, idempotent, open-world: these labels drive
        // host confirmations and must describe effects, including indirect sends.
        // The connection's last-used time is connection metadata, not a tool effect.
        const expected: Record<string, [boolean, boolean, boolean, boolean]> = {
          get_capabilities: [true, false, true, false],
          get_expert_status: [true, false, true, false],
          get_document: [true, false, true, false],
          list_documents: [true, false, true, false],
          read_document_pages: [true, false, true, false],
          get_dispatch_status: [true, false, true, false],
          dry_run_dispatch: [true, false, true, false],
          list_dispatches: [true, false, true, false],
          get_postal_requirements: [true, false, true, false],
          get_postal_setup: [true, false, true, false],
          configure_postal_sender: [false, false, false, false],
          get_postal_preflight: [true, false, true, false],
          // Quote renewal cancels the superseded prepared dispatch.
          prepare_fax: [false, true, false, false],
          prepare_dispatch: [false, false, false, false],
          create_postal_address_page: [false, false, false, false],
          preflight_postal_pdf: [false, false, false, false],
          quote_postal_draft: [false, false, false, false],
          import_document: [false, false, false, true],
          render_pdf: [false, false, false, false],
          rescan_document: [false, false, false, false],
          review_dispatch: [false, true, false, false],
          transfer_postal_draft: [false, true, false, false],
          approve_and_send_dispatch: [false, true, false, true],
          confirm_dispatch: [false, true, false, true],
          cancel_dispatch: [false, true, false, false],
        };
        expect(tools.map((tool) => tool.name).sort()).toEqual(
          Object.keys(expected).sort(),
        );
        for (const tool of tools) {
          expect(tool.title, tool.name).toEqual(expect.any(String));
          expect(tool.title!.length, tool.name).toBeGreaterThan(0);
          expect(tool.title!.length, tool.name).toBeLessThanOrEqual(80);
          const [readOnlyHint, destructiveHint, idempotentHint, openWorldHint] =
            expected[tool.name];
          expect(tool.annotations, tool.name).toEqual({
            title: tool.title,
            readOnlyHint,
            destructiveHint,
            idempotentHint,
            openWorldHint,
          });
        }
      },
      identity,
      { rescan: unused },
      undefined,
      {
        requirements: unused,
        create: unused,
        get: unused,
        quote: unused,
        transferExpert: unused,
        generateAddressPage: unused,
        getSetup: unused,
        configureSender: unused,
      },
    );
    expect(unused).not.toHaveBeenCalled();
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
