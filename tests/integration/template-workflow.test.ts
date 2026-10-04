import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import {
  DomainError,
  DomainService,
  sha256,
  type ActorContext,
} from "../../packages/domain/src/index";
import {
  TemplateWorkflowService,
  type WorkflowActor,
} from "../../apps/api/src/template-workflow";
import {
  WORKFLOW_LIMITS,
  type TemplatePermission,
  type TemplateView,
} from "../../packages/contracts/src/template-workflow";
import {
  templateAuthoringGuide,
  templateExampleCatalog,
  getTemplateExample,
} from "../../packages/templates/authoring";
import worker, { getCapabilities } from "../../apps/api/src/index";
import {
  templateWorkflowScope,
  createTemplateWorkflowRoutes,
} from "../../apps/api/src/template-workflow-routes";
import type { Env } from "../../apps/api/src/env";
import { blankTemplate, textBlock } from "../../packages/templates/gallery";
import type { MappingPlan } from "../../packages/contracts/src/datasets";
import { Hono } from "hono";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import { MCP_SCOPES } from "../../apps/api/src/auth";
import { PostalService } from "../../apps/api/src/postal";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";
import { maintainDocuments } from "../../apps/api/src/maintenance";
import { routeCode } from "../../packages/observability/src/index";
import {
  prepareProtectedDocument,
  revealProtectedDocumentPassword,
  revokeProtectedDocument,
} from "../../apps/api/src/protected-documents";

let mf: Miniflare,
  db: D1Database,
  bucket: R2Bucket,
  env: Env,
  service: TemplateWorkflowService,
  domain: DomainService;
let renders = 0;
const owner: ActorContext = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
};
const other: ActorContext = {
  organizationId: "org_studio",
  userId: "user_studio",
  role: "admin",
  actor: "browser",
};
const member: ActorContext = {
  ...owner,
  userId: "workflow_member",
  role: "member",
};
const reviewer: ActorContext = {
  ...owner,
  userId: "workflow_reviewer",
  role: "supervisor",
  supervisorCanApprove: true,
  supervisorCanReport: true,
};
async function setRole(ctx: ActorContext) {
  await db
    .prepare(
      "UPDATE memberships SET role=?,supervisor_can_approve=?,supervisor_can_report=? WHERE organization_id=? AND user_id=?",
    )
    .bind(
      ctx.role,
      Number(Boolean(ctx.supervisorCanApprove)),
      Number(Boolean(ctx.supervisorCanReport)),
      ctx.organizationId,
      ctx.userId,
    )
    .run();
}
async function sql(source: string) {
  let statement = "",
    trigger = false;
  const commands: D1PreparedStatement[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line} `;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      commands.push(db.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw Error("Incomplete SQL fixture");
  if (commands.length) await db.batch(commands);
}
async function pdf(label: string) {
  const file = await PDFDocument.create();
  file.setCreationDate(new Date("2026-01-01"));
  file.setModificationDate(new Date("2026-01-01"));
  file.addPage().drawText(label, { x: 50, y: 600 });
  return new Uint8Array(await file.save());
}
function envelope() {
  const template = blankTemplate();
  template.name = "Fixture éditable";
  template.inputSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
    },
    required: ["name"],
  };
  template.definition.schemas[0] = [
    { ...textBlock("name", "Exemple", 20, 35, 150), readOnly: false },
  ];
  template.bindings = [
    {
      block: "name",
      kind: "value",
      path: "name",
      format: "text",
      required: true,
    },
  ];
  template.sampleData = { name: "Personne fictive" };
  return template;
}
async function published(ctx = owner) {
  const template = await service.createTemplate(ctx, { envelope: envelope() });
  return service.publishTemplate(ctx, template.id, {
    expectedRevision: template.revision,
  });
}
async function job(
  records = [
    {
      recordId: "a",
      data: {
        name: "Alice",
        email: "alice@example.invalid",
        phone: "+35242123456",
      },
    },
    {
      recordId: "b",
      data: {
        name: "Bob",
        email: "bob@example.invalid",
        phone: "+35242123457",
      },
    },
  ],
) {
  const template = await published();
  return service.createGeneration(
    owner,
    { templateId: template.id, mode: "generate_only", records },
    crypto.randomUUID(),
  );
}
async function count(table: string) {
  return (await db
    .prepare(`SELECT count(*) AS n FROM ${table}`)
    .first<{ n: number }>())!.n;
}
function afterTemplateRead(interleave: () => Promise<unknown>) {
  const internals = service as unknown as {
    templateRow(
      ctx: WorkflowActor,
      id: string,
      permission?: TemplatePermission | "read",
    ): Promise<unknown>;
  };
  const original = internals.templateRow.bind(service);
  return vi
    .spyOn(internals, "templateRow")
    .mockImplementationOnce(async (...args) => {
      const snapshot = await original(...args);
      await interleave();
      return snapshot;
    });
}
async function connectWorkflow(
  scopes: string[],
  ctx = owner,
  token = "synthetic",
) {
  const server = createGuteneoMcpServer(
    {
      context: { ...ctx, actor: "mcp" },
      scopes,
      clientId: token.startsWith("gtn_dev_") ? "local-simulation" : "fixture",
      token,
      expiresAt: 9999999999,
    },
    env,
    {
      domain,
      documents: service.documents,
      workflow: service,
      capabilities: () => getCapabilities(env),
    },
  );
  const client = new Client({ name: "workflow-authoring-proof", version: "1" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  return {
    client,
    server,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
const mapping: MappingPlan = {
  version: 1,
  name: "CSV clients",
  sourceSheet: "CSV",
  headerRow: 1,
  recordKey: ["id"],
  fields: [
    { source: "nom", target: "name", type: "text", required: true },
    { source: "email", target: "email", type: "text", required: true },
  ],
  joins: [],
  excludeRows: [],
  includeHidden: false,
  formulaPolicy: "reject",
  expectedHeaders: ["id", "nom", "email"],
};

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  for (const file of readdirSync(new URL("../../migrations/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await sql(
      readFileSync(
        new URL(`../../migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await sql(
    readFileSync(new URL("../../scripts/seed.sql", import.meta.url), "utf8"),
  );
  await db
    .prepare(
      "INSERT INTO users(id,name,email,created_at) VALUES('workflow_member','Membre','member@example.invalid',?)",
    )
    .bind(new Date().toISOString())
    .run();
  await db
    .prepare(
      "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_atelier','workflow_member','member',?)",
    )
    .bind(new Date().toISOString())
    .run();
  await db
    .prepare(
      "INSERT INTO users(id,name,email,created_at) VALUES('workflow_reviewer','Revue','reviewer@example.invalid',?)",
    )
    .bind(new Date().toISOString())
    .run();
  await db
    .prepare(
      "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES('org_atelier','workflow_reviewer','member',?)",
    )
    .bind(new Date().toISOString())
    .run();
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  for (const table of [
    "protected_document_sessions",
    "protected_document_hostings",
    "distribution_postal_reviews",
    "postal_transfer_consents",
    "postal_preflights",
    "distribution_entries",
    "distribution_plans",
    "generation_record_provenance",
    "generation_records",
    "generation_jobs",
    "workflow_mappings",
    "workflow_template_sources",
    "workflow_datasets",
    "template_permissions",
    "template_versions",
    "document_templates",
    "workflow_ai_usage",
    "workflow_ai_policy",
    "approvals",
    "outbox",
    "reservations",
    "attempts",
    "dispatches",
    "documents",
    "content_usage",
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
  await db
    .prepare(
      "UPDATE memberships SET role='member',supervisor_can_approve=0,supervisor_can_report=0 WHERE user_id IN ('workflow_member','workflow_reviewer')",
    )
    .run();
  await sql(
    readFileSync(
      new URL("../../scripts/seed-content.sql", import.meta.url),
      "utf8",
    ),
  );
  await db
    .prepare(
      "UPDATE content_limits SET uploads_per_day=100,bytes_per_day=100000000,renders_per_day=100",
    )
    .run();
  renders = 0;
  env = {
    DB: db,
    DOCUMENTS: bucket,
    MODE: "simulation",
    ENVIRONMENT: "local",
    APP_ORIGIN: "http://localhost:8787",
    DOCUMENT_RENDERER: {
      fetch: async (request: Request) => {
        renders++;
        const body = (await request.json()) as { data: { name: string } };
        return new Response(await pdf(body.data.name), {
          headers: { "Content-Type": "application/pdf" },
        });
      },
    },
  } as unknown as Env;
  domain = new DomainService(db, { mode: "simulation" });
  service = new TemplateWorkflowService(env, domain);
});

describe("Persistent template workflow — local D1/R2 with explicitly synthetic renderer transport", () => {
  it.each(
    (["browser", "mcp"] as const).flatMap((actor) =>
      [false, true].flatMap((supervisorCanApprove) =>
        [false, true].map((supervisorCanReport) => ({
          actor,
          supervisorCanApprove,
          supervisorCanReport,
        })),
      ),
    ),
  )(
    "generates for supervisor $actor approval=$supervisorCanApprove reports=$supervisorCanReport without acquiring sending authority",
    async (options) => {
      const ctx: ActorContext = { ...member, role: "supervisor", ...options };
      await setRole(ctx);
      const template = await published(ctx);
      const generation = await service.createGeneration(
        ctx,
        {
          templateId: template.id,
          mode: "generate_only",
          records: [
            { recordId: "supervisor", data: { name: "Synthetic supervisor" } },
          ],
        },
        "supervisor-generation",
      );
      await service.processPending(1);
      const result = (await service.generationResults(ctx, generation.id))
        .items[0];
      expect(result.state).toBe("generated");
      expect(
        (await domain.getDocument(ctx, result.documentId!)).access_owner_id,
      ).toBe(member.userId);
      await expect(
        domain.getDocument(owner, result.documentId!),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      if (options.supervisorCanReport)
        await expect(domain.usage(ctx)).resolves.toBeDefined();
      else
        await expect(domain.usage(ctx)).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
      for (const table of ["approvals", "reservations", "outbox", "attempts"])
        expect(await count(table)).toBe(0);
    },
  );
  it("rejects stale supervisor contexts while queued generation retains preparation only when options change", async () => {
    const ctx: ActorContext = {
      ...member,
      role: "supervisor",
      supervisorCanApprove: true,
      supervisorCanReport: true,
    };
    await setRole(ctx);
    const template = await published(ctx);
    const generation = await service.createGeneration(
      ctx,
      {
        templateId: template.id,
        mode: "generate_only",
        records: [{ recordId: "queued", data: { name: "Queued synthetic" } }],
      },
      "options-change",
    );
    const current = {
      ...ctx,
      supervisorCanApprove: false,
      supervisorCanReport: false,
    };
    await setRole(current);
    await expect(service.getTemplate(ctx, template.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await service.processPending(1);
    expect(
      (await service.generationResults(current, generation.id)).items[0].state,
    ).toBe("generated");
    const spy = afterTemplateRead(() =>
      setRole({ ...current, supervisorCanReport: true }),
    );
    try {
      await expect(
        service.updateTemplate(current, template.id, {
          expectedRevision: template.revision,
          envelope: envelope(),
        }),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    } finally {
      spy.mockRestore();
    }
    expect(await count("outbox")).toBe(0);
  });
  it("opens an operator private PDF only through its exact prepared dispatch to current approvers over REST and MCP", async () => {
    const template = await published(member);
    const generation = await service.createGeneration(
      member,
      {
        templateId: template.id,
        mode: "generate_only",
        records: [
          { recordId: "review", data: { name: "Synthetic review" } },
          { recordId: "unprepared", data: { name: "Still private" } },
        ],
      },
      "member-review",
    );
    await service.processPending(2);
    const [result, unprepared] = (
      await service.generationResults(member, generation.id)
    ).items;
    await expect(
      service.documents.getContent(owner, result.documentId!),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const plan = await service.prepareDistribution(
      member,
      {
        jobId: generation.id,
        entries: [
          {
            entryId: "fax",
            recordId: result.recordId,
            channel: "fax",
            recipient: { phone: "+35242123456" },
          },
        ],
      },
      "member-review-plan",
    );
    const dispatchId = plan.entries[0].dispatchId!;
    expect(dispatchId).toBeTruthy();
    const dispatch = (await domain.getDispatch(member, dispatchId)).dispatch;
    await expect(
      domain.approveDispatch(member, dispatchId, dispatch.fingerprint),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const role of ["member", "viewer"] as const) {
      const unauthorized: ActorContext = {
        ...reviewer,
        role,
        supervisorCanApprove: false,
        supervisorCanReport: false,
      };
      await setRole(unauthorized);
      await expect(
        domain.getDispatch(unauthorized, dispatchId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        service.documents.getContent(
          unauthorized,
          result.documentId!,
          dispatchId,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await domain.listDispatches(unauthorized)).items).toEqual([]);
    }
    await setRole(reviewer);
    for (const approver of [owner, reviewer]) {
      expect(
        (await domain.getDispatch(approver, dispatchId)).dispatch.document_id,
      ).toBe(result.documentId);
      expect(
        (await domain.listDispatches(approver)).items.map((item) => item.id),
      ).toContain(dispatchId);
      expect((await domain.listDocuments(approver)).items).toEqual([]);
      await expect(
        service.documents.get(approver, result.documentId!),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        service.documents.get(approver, unprepared.documentId!, dispatchId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        service.documents.get(approver, result.documentId!, "wrong-dispatch"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const response = await service.documents.getContent(
        approver,
        result.documentId!,
        dispatchId,
      );
      expect(await sha256(new Uint8Array(await response.arrayBuffer()))).toBe(
        result.documentHash,
      );
      const exact = await service.documents.getReviewContent(
        approver,
        result.documentId!,
        dispatchId,
      );
      expect(exact.document.sha256).toBe(result.documentHash);
      await expect(
        domain.approveDispatch(approver, dispatchId, dispatch.fingerprint),
      ).resolves.toMatchObject({ id: dispatchId });
    }
    await expect(
      service.documents.getContent(other, result.documentId!, dispatchId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const token = `review-${crypto.randomUUID()}`;
    await db
      .prepare(
        "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,'csrf',1,1,?,?)",
      )
      .bind(
        await sha256(token),
        reviewer.userId,
        reviewer.organizationId,
        new Date().toISOString(),
        new Date(Date.now() + 60000).toISOString(),
      )
      .run();
    const request = (suffix: string) =>
      worker.fetch(
        new Request(
          `http://localhost:8787/api/documents/${result.documentId}${suffix}`,
          { headers: { Cookie: `guteneo_session=${token}` } },
        ),
        env,
        {} as ExecutionContext,
      );
    expect((await request("")).status).toBe(404);
    expect((await request(`?dispatchId=${dispatchId}`)).status).toBe(200);
    expect((await request(`/content?dispatchId=${dispatchId}`)).status).toBe(
      200,
    );
    const limited = await connectWorkflow(["documents:read"], reviewer);
    try {
      for (const name of ["get_document", "read_document_pages"]) {
        const response = await limited.client.callTool({
          name,
          arguments: { documentId: result.documentId, dispatchId },
        });
        expect(response.isError).toBe(true);
        expect(JSON.stringify(response._meta)).toContain(
          "documents:read dispatches:read",
        );
      }
    } finally {
      await limited.close();
    }
    const mcpToken = `gtn_dev_${crypto.randomUUID()}`;
    await db
      .prepare(
        "INSERT INTO development_mcp_tokens(token_hash,user_id,organization_id,expires_at) VALUES(?,?,?,?)",
      )
      .bind(
        await sha256(mcpToken),
        reviewer.userId,
        reviewer.organizationId,
        new Date(Date.now() + 60000).toISOString(),
      )
      .run();
    const mcp = await connectWorkflow([...MCP_SCOPES], reviewer, mcpToken);
    try {
      const response = await mcp.client.callTool({
        name: "get_document",
        arguments: { documentId: result.documentId, dispatchId },
      });
      expect(response.isError).not.toBe(true);
      expect(JSON.stringify(response.structuredContent)).toContain(
        `dispatchId=${dispatchId}`,
      );
      expect(JSON.stringify(response.structuredContent)).toContain(
        `/#/app/dispatch/${dispatchId}`,
      );
      const image = new Uint8Array([255, 216, 255, 217]);
      env.DOCUMENT_RENDERER = {
        fetch: async () =>
          Response.json({
            sha256: result.documentHash,
            totalPages: 1,
            startPage: 1,
            pageCount: 1,
            nextPage: null,
            rendering: { complete: true },
            pages: [
              {
                page: 1,
                width: 800,
                height: 1100,
                mimeType: "image/jpeg",
                imageBase64: Buffer.from(image).toString("base64"),
                imageSha256: await sha256(image),
                text: "Synthetic page",
                textTruncated: false,
              },
            ],
          }),
      } as unknown as Fetcher;
      const pages = await mcp.client.callTool({
        name: "read_document_pages",
        arguments: { documentId: result.documentId, dispatchId, page: 1 },
      });
      expect(pages.isError).not.toBe(true);
      expect(pages.content).toContainEqual(
        expect.objectContaining({ type: "image" }),
      );
    } finally {
      await mcp.close();
    }
    let reads = 0;
    env.DOCUMENTS = {
      get: async (key: string) => {
        reads++;
        const object = await bucket.get(key);
        await db
          .prepare("DELETE FROM development_mcp_tokens WHERE token_hash=?")
          .bind(await sha256(mcpToken))
          .run();
        return object;
      },
    } as unknown as R2Bucket;
    try {
      const revokedDuringRead = await worker.fetch(
        new Request(
          `http://localhost:8787/api/documents/${result.documentId}/content?dispatchId=${dispatchId}`,
          { headers: { Authorization: `Bearer ${mcpToken}` } },
        ),
        env,
        {} as ExecutionContext,
      );
      expect([401, 403]).toContain(revokedDuringRead.status);
      expect(await revokedDuringRead.text()).not.toContain("%PDF-");
      expect(reads).toBe(1);
    } finally {
      env.DOCUMENTS = bucket;
    }
    await setRole({ ...reviewer, supervisorCanApprove: false });
    await expect(
      service.documents.getContent(reviewer, result.documentId!, dispatchId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const revoked = { ...reviewer, supervisorCanApprove: false };
    await expect(domain.getDispatch(revoked, dispatchId)).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    expect((await domain.listDispatches(revoked)).items).toEqual([]);
    expect((await request(`/content?dispatchId=${dispatchId}`)).status).toBe(
      404,
    );
    expect(await count("approvals")).toBe(0);
    for (const table of ["reservations", "outbox", "attempts"])
      expect(await count(table)).toBe(0);
  });
  it.each(["metadata", "content", "pages"] as const)(
    "withdraws contextual private PDF access when approval is revoked during %s reading",
    async (kind) => {
      const template = await published(member);
      const generation = await service.createGeneration(
        member,
        {
          templateId: template.id,
          mode: "generate_only",
          records: [
            { recordId: "review", data: { name: "Synthetic revoked review" } },
          ],
        },
        "revoke-during-review",
      );
      await service.processPending(1);
      const result = (await service.generationResults(member, generation.id))
        .items[0];
      const dispatch = await domain.prepareDispatch(
        member,
        {
          channel: "fax",
          recipient: { phone: "+35242123456" },
          documentId: result.documentId!,
        },
        "revoke-review-dispatch",
      );
      await setRole(reviewer);
      if (kind === "metadata") {
        const internals = service.documents as unknown as {
          analysisRow(ctx: ActorContext, id: string): Promise<unknown>;
        };
        const original = internals.analysisRow.bind(service.documents);
        const spy = vi
          .spyOn(internals, "analysisRow")
          .mockImplementationOnce(async (...args) => {
            const row = await original(...args);
            await setRole({ ...reviewer, supervisorCanApprove: false });
            return row;
          });
        try {
          await expect(
            service.documents.get(reviewer, result.documentId!, dispatch.id),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
        } finally {
          spy.mockRestore();
        }
      } else if (kind === "content") {
        let reads = 0;
        env.DOCUMENTS = {
          get: async (key: string) => {
            reads++;
            const object = await bucket.get(key);
            await setRole({ ...reviewer, supervisorCanApprove: false });
            return object;
          },
        } as unknown as R2Bucket;
        try {
          await expect(
            service.documents.getContent(
              reviewer,
              result.documentId!,
              dispatch.id,
            ),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
        } finally {
          env.DOCUMENTS = bucket;
        }
        expect(reads).toBe(1);
      } else {
        const bytes = new Uint8Array([255, 216, 255, 217]);
        env.DOCUMENT_RENDERER = {
          fetch: async () => {
            await setRole({ ...reviewer, supervisorCanApprove: false });
            return Response.json({
              sha256: result.documentHash,
              totalPages: 1,
              startPage: 1,
              pageCount: 1,
              nextPage: null,
              rendering: { complete: true },
              pages: [
                {
                  page: 1,
                  width: 800,
                  height: 1100,
                  mimeType: "image/jpeg",
                  imageBase64: Buffer.from(bytes).toString("base64"),
                  imageSha256: await sha256(bytes),
                  text: "Synthetic review",
                  textTruncated: false,
                },
              ],
            });
          },
        } as unknown as Fetcher;
        await expect(
          service.documents.getReviewPages(
            reviewer,
            result.documentId!,
            1,
            dispatch.id,
          ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(await count("outbox")).toBe(0);
    },
  );
  it("soft-deletes only for the current non-viewer owner and retains published jobs, provenance and private PDFs", async () => {
    let template = await published();
    template = await service.shareTemplate(owner, template.id, {
      expectedRevision: template.revision,
      visibility: "selected",
      syntheticSamplesConfirmed: true,
      grants: [
        {
          userId: member.userId,
          use: true,
          edit: true,
          publish: true,
          share: true,
        },
      ],
    });
    expect(template.canDelete).toBe(true);
    expect((await service.getTemplate(member, template.id)).canDelete).toBe(
      false,
    );
    await expect(
      service.deleteTemplate(other, template.id, {
        expectedRevision: template.revision,
      }),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    await expect(
      service.deleteTemplate(member, template.id, {
        expectedRevision: template.revision,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const completed = await service.createGeneration(
      owner,
      {
        templateId: template.id,
        mode: "generate_only",
        records: [{ recordId: "historical", data: { name: "History" } }],
      },
      "deletion-history",
    );
    await service.processPending();
    const original = (await service.generationResults(owner, completed.id))
      .items[0];
    expect(original.state).toBe("generated");
    const provenance = await service.generationProvenance(
      owner,
      completed.id,
      "historical",
    );
    const pending = await service.createGeneration(
      owner,
      {
        templateId: template.id,
        mode: "generate_only",
        records: [{ recordId: "pending", data: { name: "Pending" } }],
      },
      "deletion-pending",
    );
    await expect(
      service.deleteTemplate(owner, template.id, {
        expectedRevision: template.revision - 1,
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(
      await service.deleteTemplate(owner, template.id, {
        expectedRevision: template.revision,
      }),
    ).toEqual({ id: template.id, deleted: true });
    expect((await service.listTemplates(owner)).items).toEqual([]);
    expect((await service.listTemplates(member)).items).toEqual([]);
    for (const read of [
      () => service.getTemplate(owner, template.id),
      () => service.getTemplate(owner, template.id, 1),
      () => service.getTemplateSharing(owner, template.id),
      () => service.duplicateTemplate(owner, template.id),
      () =>
        service.previewTemplate(owner, template.id, {
          expectedRevision: template.revision + 1,
          data: { name: "Deleted" },
        }),
      () =>
        service.createGeneration(
          owner,
          {
            templateId: template.id,
            mode: "generate_only",
            records: [{ recordId: "x", data: { name: "Deleted" } }],
          },
          "deleted-reuse",
        ),
    ])
      await expect(read()).rejects.toMatchObject({
        code: "TEMPLATE_NOT_FOUND",
      });
    const retained = await db
      .prepare(
        "SELECT state,deleted_at,revision FROM document_templates WHERE id=?",
      )
      .bind(template.id)
      .first();
    expect(retained).toMatchObject({
      state: "archived",
      revision: template.revision + 1,
    });
    expect(retained!.deleted_at).toBeTypeOf("string");
    expect(await count("template_versions")).toBe(1);
    expect(
      await service.generationProvenance(owner, completed.id, "historical"),
    ).toEqual(provenance);
    expect(
      (await service.generationResults(owner, completed.id)).items[0],
    ).toEqual(original);
    const document = await domain.getDocument(owner, original.documentId!);
    expect(await bucket.get(document.storage_key)).not.toBeNull();
    await expect(
      domain.getDocument(member, original.documentId!),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.processPending();
    expect(renders).toBe(1);
    expect(
      (await service.generationResults(owner, pending.id)).items[0],
    ).toMatchObject({ state: "failed", errorCode: "TEMPLATE_NOT_FOUND" });
    expect(await count("outbox")).toBe(0);
    expect(await count("reservations")).toBe(0);
    await expect(
      db
        .prepare(
          "UPDATE document_templates SET deleted_at=NULL,state='draft' WHERE id=?",
        )
        .bind(template.id)
        .run(),
    ).rejects.toThrow("deleted template is immutable");
  });
  it("denies deletion to a viewer even when that member owns the template", async () => {
    const template = await published(member);
    await db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
      .bind(member.organizationId, member.userId)
      .run();
    const viewer = { ...member, role: "viewer" as const };
    expect((await service.getTemplate(viewer, template.id)).canDelete).toBe(
      false,
    );
    await expect(
      service.deleteTemplate(viewer, template.id, {
        expectedRevision: template.revision,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await db
        .prepare("SELECT deleted_at FROM document_templates WHERE id=?")
        .bind(template.id)
        .first(),
    ).toEqual({ deleted_at: null });
  });
  it.each(["update", "publish", "share"] as const)(
    "lets deletion win between %s read and mutation without resurrecting templates or shares",
    async (action) => {
      let template = await published();
      const grants = [
        {
          userId: member.userId,
          use: true,
          edit: true,
          publish: true,
          share: true,
        },
      ];
      template = await service.shareTemplate(owner, template.id, {
        expectedRevision: template.revision,
        visibility: "selected",
        syntheticSamplesConfirmed: true,
        grants,
      });
      const spy = afterTemplateRead(() =>
        service.deleteTemplate(owner, template.id, {
          expectedRevision: template.revision,
        }),
      );
      try {
        const mutation =
          action === "update"
            ? service.updateTemplate(owner, template.id, {
                expectedRevision: template.revision,
                envelope: { ...template.envelope, name: "Concurrent edit" },
              })
            : action === "publish"
              ? service.publishTemplate(owner, template.id, {
                  expectedRevision: template.revision,
                })
              : service.shareTemplate(owner, template.id, {
                  expectedRevision: template.revision,
                  visibility: "organization",
                  syntheticSamplesConfirmed: true,
                  grants: [],
                });
        await expect(mutation).rejects.toMatchObject({
          code: "REVISION_CONFLICT",
        });
      } finally {
        spy.mockRestore();
      }
      expect(
        await db
          .prepare(
            "SELECT state,revision,visibility,name FROM document_templates WHERE id=?",
          )
          .bind(template.id)
          .first(),
      ).toEqual({
        state: "archived",
        revision: template.revision + 1,
        visibility: "selected",
        name: template.name,
      });
      expect(await count("template_versions")).toBe(1);
      expect(await count("template_permissions")).toBe(1);
      expect((await service.listTemplates(owner)).items).toEqual([]);
    },
  );
  it("rejects stale deletion when an edit commits after its read", async () => {
    const template = await published();
    const spy = afterTemplateRead(() =>
      service.updateTemplate(owner, template.id, {
        expectedRevision: template.revision,
        envelope: { ...template.envelope, name: "Fresh edit" },
      }),
    );
    try {
      await expect(
        service.deleteTemplate(owner, template.id, {
          expectedRevision: template.revision,
        }),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    } finally {
      spy.mockRestore();
    }
    expect(await service.getTemplate(owner, template.id)).toMatchObject({
      name: "Fresh edit",
      state: "draft",
      revision: template.revision + 1,
    });
  });
  it.each(["membership", "oauth"] as const)(
    "fences deletion against %s revocation after permission read",
    async (kind) => {
      const template = await published(member);
      const connectionId = `template-delete-${crypto.randomUUID()}`;
      await db
        .prepare(
          "INSERT INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)",
        )
        .bind(
          connectionId,
          "https://synthetic.invalid",
          member.userId,
          connectionId,
          member.organizationId,
          new Date().toISOString(),
          new Date().toISOString(),
        )
        .run();
      const ctx: WorkflowActor = {
        ...member,
        actor: "mcp",
        authority: { connectionId, authorizationRevision: 0 },
      };
      const spy = afterTemplateRead(async () => {
        if (kind === "membership")
          await db
            .prepare(
              "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
            )
            .bind(member.organizationId, member.userId)
            .run();
        else
          await db
            .prepare(
              "UPDATE authorized_connections SET not_before=not_before+1 WHERE id=?",
            )
            .bind(connectionId)
            .run();
      });
      try {
        await expect(
          service.deleteTemplate(ctx, template.id, {
            expectedRevision: template.revision,
          }),
        ).rejects.toMatchObject({
          code: kind === "membership" ? "FORBIDDEN" : "CONNECTION_REVOKED",
        });
        expect(
          await db
            .prepare(
              "SELECT state,revision,deleted_at FROM document_templates WHERE id=?",
            )
            .bind(template.id)
            .first(),
        ).toEqual({
          state: "published",
          revision: template.revision,
          deleted_at: null,
        });
      } finally {
        spy.mockRestore();
        await db
          .prepare("DELETE FROM authorized_connections WHERE id=?")
          .bind(connectionId)
          .run();
      }
    },
  );
  it("releases the active template quota after soft deletion without erasing history", async () => {
    const template = await published();
    const ids = Array.from(
      { length: WORKFLOW_LIMITS.templatesPerOrganization - 1 },
      (_, n) => `quota-template-${n}`,
    );
    await db
      .prepare(
        "INSERT INTO document_templates(id,organization_id,owner_id,name,state,draft_json,created_at,updated_at) SELECT value,?,?,?,'draft',?,?,? FROM json_each(?)",
      )
      .bind(
        owner.organizationId,
        owner.userId,
        "Quota",
        JSON.stringify(template.envelope),
        new Date().toISOString(),
        new Date().toISOString(),
        JSON.stringify(ids),
      )
      .run();
    await expect(
      service.createTemplate(owner, { envelope: envelope() }),
    ).rejects.toMatchObject({ code: "TEMPLATE_QUOTA" });
    await service.deleteTemplate(owner, template.id, {
      expectedRevision: template.revision,
    });
    expect(
      (await service.createTemplate(owner, { envelope: envelope() })).canDelete,
    ).toBe(true);
    expect(await count("document_templates")).toBe(
      WORKFLOW_LIMITS.templatesPerOrganization + 1,
    );
    expect(await count("template_versions")).toBe(1);
  });
  it("rejects preview registration when deletion commits during rendering", async () => {
    const template = await published();
    env.DOCUMENT_RENDERER = {
      fetch: async () => {
        await service.deleteTemplate(owner, template.id, {
          expectedRevision: template.revision,
        });
        return new Response(await pdf("Deleted while rendering"), {
          headers: { "Content-Type": "application/pdf" },
        });
      },
    } as unknown as Fetcher;
    await expect(
      service.previewTemplate(owner, template.id, {
        expectedRevision: template.revision,
        data: { name: "Preview" },
      }),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    expect(await count("documents")).toBe(0);
  });
  it("serves authenticated authoring rules and examples over REST through creation, preview and owner deletion", async () => {
    const app = new Hono<{
      Bindings: Env;
      Variables: { actor: WorkflowActor };
    }>();
    app.use("*", async (c, next) => {
      c.set("actor", c.req.header("X-Test-Member") ? member : owner);
      await next();
    });
    app.onError(
      (error) =>
        new Response(
          JSON.stringify({ error: { code: (error as DomainError).code } }),
          {
            status: (error as DomainError).status || 500,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    app.route(
      "/",
      createTemplateWorkflowRoutes(() => domain),
    );
    const request = (path: string, method = "GET", body?: unknown) =>
      app.request(
        path,
        {
          method,
          ...(body
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : {}),
        },
        env,
      );
    for (const path of [
      "/api/templates/authoring-guide",
      "/api/templates/examples",
      "/api/templates/examples/invoice",
    ]) {
      expect(templateWorkflowScope(path, "GET")).toBe("templates:read");
      const unauthenticated = await worker.fetch(
        new Request(`http://localhost:8787${path}`),
        env,
        {} as ExecutionContext,
      );
      expect(unauthenticated.status).toBe(401);
    }
    const guideResponse = await request("/api/templates/authoring-guide");
    expect(guideResponse.status).toBe(200);
    const guide = (await guideResponse.json()) as ReturnType<
      typeof templateAuthoringGuide
    >;
    expect(guide).toEqual(templateAuthoringGuide());
    const catalog = (await (
      await request("/api/templates/examples")
    ).json()) as ReturnType<typeof templateExampleCatalog>;
    expect(catalog).toEqual(templateExampleCatalog());
    expect(catalog.map((item) => item.id)).toEqual(
      expect.arrayContaining(["quote", "delivery-note"]),
    );
    const exampleResponse = await request("/api/templates/examples/quote");
    expect(exampleResponse.status).toBe(200);
    const example = (await exampleResponse.json()) as NonNullable<
      ReturnType<typeof getTemplateExample>
    >;
    expect(example).toEqual(getTemplateExample("quote"));
    expect((await request("/api/templates/examples/unknown")).status).toBe(404);
    expect(templateWorkflowScope("/api/templates/examples/share", "GET")).toBe(
      "templates:read",
    );
    expect((await request("/api/templates/examples/share")).status).toBe(404);
    expect(await count("document_templates")).toBe(0);
    expect(await count("workflow_ai_usage")).toBe(0);
    expect(renders).toBe(0);
    env.DOCUMENT_RENDERER = {
      fetch: async () => {
        renders++;
        return new Response(await pdf("Synthetic REST example"), {
          headers: { "Content-Type": "application/pdf" },
        });
      },
    } as unknown as Fetcher;
    const create = await request("/api/templates", "POST", {
      envelope: example.envelope,
    });
    expect(create.status).toBe(201);
    const template = (await create.json()) as TemplateView;
    expect(template).toMatchObject({
      name: example.envelope.name,
      canDelete: true,
      state: "draft",
    });
    const preview = await request(
      `/api/templates/${template.id}/preview`,
      "POST",
      {
        expectedRevision: template.revision,
        data: example.envelope.sampleData,
      },
    );
    expect(preview.status).toBe(201);
    expect(renders).toBe(1);
    expect(await count("documents")).toBe(1);
    expect(
      templateWorkflowScope(`/api/templates/${template.id}`, "DELETE"),
    ).toBe("templates:write");
    const deleted = await request(`/api/templates/${template.id}`, "DELETE", {
      expectedRevision: template.revision,
    });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ id: template.id, deleted: true });
    expect((await request(`/api/templates/${template.id}`)).status).toBe(404);
    expect(await count("documents")).toBe(1);
    expect(await count("outbox")).toBe(0);
    expect(await count("workflow_ai_usage")).toBe(0);
    await db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
      .bind(member.organizationId, member.userId)
      .run();
    const staleMember = await app.request(
      "/api/templates/authoring-guide",
      { headers: { "X-Test-Member": "1" } },
      env,
    );
    expect(staleMember.status).toBe(403);
  });
  it("exposes authoring guide and example MCP tools with scopes, usable envelopes and destructive owner deletion", async () => {
    env.DOCUMENT_RENDERER = {
      fetch: async () => {
        renders++;
        return new Response(await pdf("Synthetic MCP example"), {
          headers: { "Content-Type": "application/pdf" },
        });
      },
    } as unknown as Fetcher;
    const full = await connectWorkflow([...MCP_SCOPES]);
    try {
      const discovery = await full.client.listTools();
      for (const name of [
        "get_template_authoring_guide",
        "list_template_examples",
        "get_template_example",
      ]) {
        const tool = discovery.tools.find((t) => t.name === name)!;
        expect(tool).toBeTruthy();
        expect(tool.annotations?.destructiveHint).toBe(false);
        expect(tool._meta?.securitySchemes).toEqual([
          { type: "oauth2", scopes: ["templates:read"] },
        ]);
      }
      const deletion = discovery.tools.find(
        (t) => t.name === "delete_template",
      )!;
      expect(deletion.annotations).toMatchObject({
        destructiveHint: true,
        readOnlyHint: false,
      });
      expect(deletion._meta?.securitySchemes).toEqual([
        { type: "oauth2", scopes: ["templates:write"] },
      ]);
      const caps = await full.client.callTool({
        name: "get_capabilities",
        arguments: {},
      });
      expect(
        (caps.structuredContent as { data: { studio: { templates: unknown } } })
          .data.studio.templates,
      ).toMatchObject({
        authoringGuide: "/api/templates/authoring-guide",
        examples: "/api/templates/examples",
        ownerDeletionRetainsHistory: true,
      });
      const guideResult = await full.client.callTool({
        name: "get_template_authoring_guide",
        arguments: {},
      });
      expect(guideResult.isError).not.toBe(true);
      const guide = (
        guideResult.structuredContent as {
          data: ReturnType<typeof templateAuthoringGuide>;
        }
      ).data;
      expect(guide.envelopeSchema).toHaveProperty("properties");
      expect(
        guide.workflow.find((step) => step.tool === "preview_template")?.scope,
      ).toBe("generations:write");
      const catalog = await full.client.callTool({
        name: "list_template_examples",
        arguments: {},
      });
      expect((catalog.structuredContent as { data: unknown }).data).toEqual(
        templateExampleCatalog(),
      );
      const unknown = await full.client.callTool({
        name: "get_template_example",
        arguments: { exampleId: "unknown" },
      });
      expect(
        (unknown.structuredContent as { error: { code: string } }).error.code,
      ).toBe("TEMPLATE_EXAMPLE_NOT_FOUND");
      const source = await full.client.callTool({
        name: "get_template_example",
        arguments: { exampleId: "delivery-note" },
      });
      expect(source.isError).not.toBe(true);
      const example = (
        source.structuredContent as {
          data: NonNullable<ReturnType<typeof getTemplateExample>>;
        }
      ).data;
      expect(await count("document_templates")).toBe(0);
      expect(renders).toBe(0);
      const created = await full.client.callTool({
        name: "create_template",
        arguments: { envelope: example.envelope },
      });
      expect(created.isError).not.toBe(true);
      const template = (created.structuredContent as { data: TemplateView })
        .data;
      const preview = await full.client.callTool({
        name: "preview_template",
        arguments: {
          id: template.id,
          expectedRevision: template.revision,
          data: example.envelope.sampleData,
        },
      });
      expect(preview.isError).not.toBe(true);
      expect(renders).toBe(1);
      const deleted = await full.client.callTool({
        name: "delete_template",
        arguments: { id: template.id, expectedRevision: template.revision },
      });
      expect((deleted.structuredContent as { data: unknown }).data).toEqual({
        id: template.id,
        deleted: true,
      });
      expect(await count("documents")).toBe(1);
      expect(await count("outbox")).toBe(0);
      expect(await count("reservations")).toBe(0);
      expect(await count("workflow_ai_usage")).toBe(0);
    } finally {
      await full.close();
    }
    const readOnly = await connectWorkflow(["templates:read"]);
    try {
      for (const [name, args] of [
        ["get_template_authoring_guide", {}],
        ["list_template_examples", {}],
        ["get_template_example", { exampleId: "letter" }],
      ] as const)
        expect(
          (await readOnly.client.callTool({ name, arguments: args })).isError,
        ).not.toBe(true);
      const deleted = await readOnly.client.callTool({
        name: "delete_template",
        arguments: { id: "unavailable", expectedRevision: 1 },
      });
      expect(
        (deleted.structuredContent as { error: { code: string } }).error.code,
      ).toBe("INSUFFICIENT_SCOPE");
    } finally {
      await readOnly.close();
    }
    const noRead = await connectWorkflow(["templates:write"]);
    try {
      for (const [name, args] of [
        ["get_template_authoring_guide", {}],
        ["list_template_examples", {}],
        ["get_template_example", { exampleId: "letter" }],
      ] as const) {
        const rejected = await noRead.client.callTool({
          name,
          arguments: args,
        });
        expect(
          (rejected.structuredContent as { error: { code: string } }).error
            .code,
        ).toBe("INSUFFICIENT_SCOPE");
      }
    } finally {
      await noRead.close();
    }
  });
  it("rejects deeply nested raw envelopes and patches before recursive schema parsing", async () => {
    let field: unknown = { type: "string" };
    for (let i = 0; i < 2000; i++) field = { type: "array", items: field };
    await expect(
      service.createTemplate(owner, {
        envelope: {
          ...envelope(),
          inputSchema: { type: "object", properties: { deep: field } },
        },
      }),
    ).rejects.toMatchObject({ code: "TEMPLATE_COMPLEXITY" });
    const template = await service.createTemplate(owner, {
      envelope: envelope(),
    });
    await expect(
      service.updateTemplate(owner, template.id, {
        expectedRevision: template.revision,
        patch: {
          op: "add_table_column",
          block: "name",
          column: { header: "Deep", path: "deep" },
          field,
        },
      }),
    ).rejects.toMatchObject({ code: "TEMPLATE_COMPLEXITY" });
    expect((await service.getTemplate(owner, template.id)).revision).toBe(
      template.revision,
    );
  });
  it("making a shared template private revokes every retained member grant and stops queued work", async () => {
    let template = await published();
    const grants = [
      {
        userId: member.userId,
        use: true,
        edit: true,
        publish: true,
        share: true,
      },
    ];
    template = await service.shareTemplate(owner, template.id, {
      expectedRevision: template.revision,
      visibility: "selected",
      syntheticSamplesConfirmed: true,
      grants,
    });
    const generation = await service.createGeneration(
      member,
      {
        templateId: template.id,
        mode: "generate_only",
        records: [{ recordId: "a", data: { name: "Private after sharing" } }],
      },
      "revoked-template-grant",
    );
    await service.shareTemplate(owner, template.id, {
      expectedRevision: template.revision,
      visibility: "private",
      syntheticSamplesConfirmed: true,
      grants,
    });
    expect((await service.listTemplates(member)).items).toHaveLength(0);
    await expect(
      service.getTemplate(member, template.id),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    await expect(
      service.updateTemplate(member, template.id, {
        expectedRevision: template.revision + 1,
        envelope: template.envelope,
      }),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    await expect(
      service.getTemplateSharing(member, template.id),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    await service.processPending();
    expect(renders).toBe(0);
    expect(
      (await service.generationResults(member, generation.id)).items[0]
        .errorCode,
    ).toBe("TEMPLATE_NOT_FOUND");
  });
  it("keeps generated PDF IDs private even with a shared template and identical bytes generated by another member", async () => {
    let template = await published();
    template = await service.shareTemplate(owner, template.id, {
      expectedRevision: template.revision,
      visibility: "organization",
      syntheticSamplesConfirmed: true,
      grants: [],
    });
    const input = {
      templateId: template.id,
      mode: "generate_only",
      records: [{ recordId: "a", data: { name: "Identical synthetic text" } }],
    };
    const a = await service.createGeneration(owner, input, "private-owner"),
      b = await service.createGeneration(member, input, "private-member");
    await service.processPending(2);
    const first = (await service.generationResults(owner, a.id)).items[0],
      second = (await service.generationResults(member, b.id)).items[0];
    expect(first.documentHash).toBe(second.documentHash);
    expect(first.documentId).not.toBe(second.documentId);
    await expect(
      service.documents.get(member, first.documentId!),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.documents.getContent(member, first.documentId!),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.documents.getReviewContent(member, first.documentId!),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      domain.prepareDispatch(
        member,
        {
          channel: "fax",
          recipient: { phone: "+35242123456" },
          documentId: first.documentId!,
        },
        "private-leak",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      (await service.documents.list(member)).items.map((d) => d.id),
    ).toEqual([second.documentId]);
    const campaign = await domain.createCampaign(owner, {
      name: "Private generated mail",
    });
    const firstDispatch = await domain.prepareDispatch(
      owner,
      {
        channel: "fax",
        recipient: { phone: "+35242123456" },
        documentId: first.documentId!,
        campaignId: String(campaign.id),
      },
      "private-dispatch-owner",
    );
    const secondDispatch = await domain.prepareDispatch(
      member,
      {
        channel: "fax",
        recipient: { phone: "+35242123457" },
        documentId: second.documentId!,
        campaignId: String(campaign.id),
      },
      "private-dispatch-member",
    );
    await expect(
      domain.getDispatch(member, firstDispatch.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      (
        await domain.listDispatches(member, undefined, 30, "approval")
      ).items.map((d) => d.id),
    ).toEqual([secondDispatch.id]);
    expect(
      (await domain.getCampaign(member, String(campaign.id))).dispatches.map(
        (d) => d.id,
      ),
    ).toEqual([secondDispatch.id]);
    await expect(domain.dispatchOverview(member)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await db
      .prepare(
        "UPDATE memberships SET role='supervisor',supervisor_can_report=1 WHERE organization_id=? AND user_id=?",
      )
      .bind(member.organizationId, member.userId)
      .run();
    expect(
      await domain.dispatchOverview({
        ...member,
        role: "supervisor",
        supervisorCanReport: true,
      }),
    ).toMatchObject({
      documents: 1,
      dispatches: { total: 1, approval: 1 },
    });
    await db
      .prepare(
        "UPDATE memberships SET role='member',supervisor_can_report=0 WHERE organization_id=? AND user_id=?",
      )
      .bind(member.organizationId, member.userId)
      .run();
    const explicitImport = await service.documents.upload(owner, {
      name: "supplied-exact.pdf",
      bytes: await pdf("Identical synthetic text"),
    });
    expect(explicitImport.id).not.toBe(first.documentId);
    expect((await service.documents.get(member, explicitImport.id)).id).toBe(
      explicitImport.id,
    );
  });
  it("keeps protected-link secrets for a generated PDF restricted to its creator", async () => {
    const generation = await job();
    await service.processPending(1);
    const document = (await service.generationResults(owner, generation.id))
      .items[0];
    await db
      .prepare("UPDATE organizations SET mode='production' WHERE id=?")
      .bind(owner.organizationId)
      .run();
    try {
      const production = {
        ...env,
        MODE: "production" as const,
        ENVIRONMENT: "production" as const,
        PROTECTED_DOCUMENTS_KEY: "x".repeat(43),
      };
      const stamp = new Date().toISOString();
      await db
        .prepare(
          "INSERT INTO audit_log VALUES(?,?,?,'document.scan_verified',?,'{}',?)",
        )
        .bind(
          crypto.randomUUID(),
          owner.organizationId,
          owner.userId,
          document.documentHash,
          stamp,
        )
        .run();
      await expect(
        prepareProtectedDocument(production, member, {
          documentId: document.documentId!,
        }),
      ).rejects.toMatchObject({ code: "DOCUMENT_NOT_READY" });
      const protectedDocument = await prepareProtectedDocument(
        production,
        owner,
        { documentId: document.documentId! },
      );
      await db
        .prepare(
          "INSERT OR IGNORE INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES('workflow_private_email_sender',?,'email','Fixture','sender@example.invalid','verified','production',?)",
        )
        .bind(owner.organizationId, stamp)
        .run();
      const dispatchId = `dsp_${crypto.randomUUID()}`;
      await db
        .prepare(
          "INSERT INTO dispatches(id,organization_id,channel,recipient_json,document_id,sender_id,sender_address,subject,html,text,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES(?,?,'email',?,?,'workflow_private_email_sender','sender@example.invalid','Private subject','<p>Private body</p>','Private body',?,'prepared','production',100,100,'EUR',?,?,?,?,?)",
        )
        .bind(
          dispatchId,
          owner.organizationId,
          JSON.stringify({ email: "recipient@example.invalid" }),
          document.documentId,
          JSON.stringify({
            protectedDocument: { hostingId: protectedDocument.hostingId },
          }),
          "a".repeat(64),
          dispatchId,
          "b".repeat(64),
          stamp,
          stamp,
        )
        .run();
      const secrets = await revealProtectedDocumentPassword(
        production,
        owner,
        dispatchId,
      );
      expect(secrets.password).toMatch(/^[A-Za-z0-9_-]{24}$/);
      await expect(
        revealProtectedDocumentPassword(production, member, dispatchId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        revokeProtectedDocument(production, member, dispatchId),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await db
        .prepare(
          "UPDATE memberships SET role='supervisor',supervisor_can_approve=1 WHERE organization_id=? AND user_id=?",
        )
        .bind(member.organizationId, member.userId)
        .run();
      await expect(
        revokeProtectedDocument(
          production,
          { ...member, role: "supervisor", supervisorCanApprove: true },
          dispatchId,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(
        (await revealProtectedDocumentPassword(production, owner, dispatchId))
          .password,
      ).toBe(secrets.password);
      expect(await count("outbox")).toBe(0);
    } finally {
      await db
        .prepare("UPDATE organizations SET mode='simulation' WHERE id=?")
        .bind(owner.organizationId)
        .run();
    }
  });
  it("uses fixed route labels without logging arbitrary dataset or record paths", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const request = (path: string) => new Request(`http://localhost${path}`);
    for (const path of [
      "/api/templates/authoring-guide",
      "/api/templates/examples",
      ...templateExampleCatalog().map(
        ({ id }) => `/api/templates/examples/${id}`,
      ),
    ])
      expect(routeCode(request(path))).toBe("templates");
    expect(routeCode(request("/api/templates/examples/private-person"))).toBe(
      "unknown",
    );
    expect(routeCode(request(`/api/templates/tpl_${id}/preview`))).toBe(
      "templates",
    );
    expect(routeCode(request(`/api/datasets/data_${id}/profile`))).toBe(
      "datasets",
    );
    expect(
      routeCode(
        request(
          `/api/generation-jobs/gen_${id}/provenance?recordId=private-person`,
        ),
      ),
    ).toBe("generations");
    expect(
      routeCode(request("/api/datasets/customer@example.invalid/profile")),
    ).toBe("unknown");
    expect(
      routeCode(
        request(
          `/api/distribution-plans/dist_${id}/entries/customer@example.invalid/postal-preflight`,
        ),
      ),
    ).toBe("unknown");
    expect(routeCode(request("/render/template"), "documents")).toBe("render");
    expect(routeCode(request("/scan-source"), "scanner")).toBe("scan");
  });
  it("imports exact XML over multipart REST with a persisted explicit record path", async () => {
    const xml =
      "<export><meta>Fictional fixture</meta><clients><client><id>001</id><name>Alice</name><email>alice@example.invalid</email></client><client><id>002</id><name>Bob</name><email>bob@example.invalid</email></client></clients></export>";
    const app = new Hono<{
      Bindings: Env;
      Variables: { actor: ActorContext };
    }>();
    app.use("*", async (c, next) => {
      c.set("actor", owner);
      await next();
    });
    app.route(
      "/",
      createTemplateWorkflowRoutes(() => domain),
    );
    const body = new FormData();
    body.set(
      "file",
      new File([xml], "clients.xml", { type: "application/xml" }),
    );
    body.set("xmlRecordPath", "/export/clients/client");
    const response = await app.request(
      "/api/datasets",
      { method: "POST", body },
      env,
    );
    expect(response.status).toBe(201);
    const source = (await response.json()) as {
      id: string;
      status: string;
      format: string;
      sha256: string;
    };
    expect(source).toMatchObject({
      status: "ready",
      format: "xml",
      sha256: await sha256(new TextEncoder().encode(xml)),
    });
    const { profile } = await service.getDatasetProfile(owner, source.id);
    expect(profile.sheets[0].rows).toHaveLength(3);
    expect(profile.sheets[0].rows[1].cells.map((cell) => cell.raw)).toContain(
      "001",
    );
    expect(profile.sheets[0].rows[1].cells.map((cell) => cell.raw)).toContain(
      "alice@example.invalid",
    );
    const stored = await db
      .prepare(
        "SELECT parsing_options_json FROM workflow_datasets WHERE organization_id=? AND id=?",
      )
      .bind(owner.organizationId, source.id)
      .first<{ parsing_options_json: string }>();
    expect(JSON.parse(stored!.parsing_options_json)).toEqual({
      xmlRecordPath: "/export/clients/client",
    });
    await expect(
      service.getDatasetProfile(member, source.id),
    ).rejects.toMatchObject({ code: "DATASET_NOT_FOUND" });
    const ambiguous = await service.importDataset(owner, {
      name: "ambiguous.xml",
      format: "xml",
      bytes: new TextEncoder().encode(xml),
    });
    expect(ambiguous).toMatchObject({
      status: "quarantined",
      errorCode: "XML_RECORD_PATH_REQUIRED",
    });
    expect(await count("generation_jobs")).toBe(0);
    expect(await count("outbox")).toBe(0);
  });
  it("freezes each record's explicit delivery channel and only its matching recipient, sender and options", async () => {
    const template = envelope();
    template.inputSchema.properties!.delivery = { type: "string" };
    template.inputSchema.properties!.address = {
      type: "object",
      properties: {
        name: { type: "string" },
        line1: { type: "string" },
        postalCode: { type: "string" },
        city: { type: "string" },
        country: { type: "string" },
      },
      required: [],
    };
    const created = await service.createTemplate(owner, { envelope: template });
    const publishedTemplate = await service.publishTemplate(owner, created.id, {
      expectedRevision: created.revision,
    });
    const records = [
      {
        recordId: "fax",
        data: { name: "Fax person", delivery: "fax", phone: "+35242123456" },
      },
      {
        recordId: "email",
        data: {
          name: "Email person",
          delivery: "email",
          email: "email@example.invalid",
        },
      },
      {
        recordId: "postal",
        data: {
          name: "Postal person",
          delivery: "postal",
          address: {
            name: "Postal person",
            line1: "1 Rue fictive",
            postalCode: "1234",
            city: "Luxembourg",
            country: "LU",
          },
        },
      },
      {
        recordId: "missing",
        data: { name: "Missing channel", phone: "+35242123456" },
      },
      {
        recordId: "invalid",
        data: {
          name: "Invalid channel",
          delivery: "courrier",
          phone: "+35242123456",
        },
      },
    ];
    const generation = await service.createGeneration(
      owner,
      { templateId: publishedTemplate.id, mode: "generate_only", records },
      "mixed-channel-job",
    );
    await service.processPending(5);
    const recipientFieldsByChannel = {
      fax: { phone: "phone" },
      email: { email: "email" },
      postal: {
        name: "address.name",
        line1: "address.line1",
        postalCode: "address.postalCode",
        city: "address.city",
        country: "address.country",
      },
    };
    const entries = ["fax", "email", "postal"].map((recordId) => ({
      entryId: recordId,
      recordId,
      channelField: "delivery",
      recipientFieldsByChannel,
      subject: "Fictional message",
      text: "Fictional content",
      ceilingMinor: 200,
      senderIdsByChannel: { postal: "postal_fixture" },
      optionsByChannel: {
        postal: {
          addressPosition: "right",
          printMode: "simplex",
          printSpectrum: "grayscale",
          deliveryProduct: "cheap",
        },
        email: { kind: "transactional" },
      },
    }));
    const result = await service.prepareDistribution(
      owner,
      { jobId: generation.id, entries },
      "mixed-channel-plan",
    );
    expect(result.entries.map((entry) => entry.channel)).toEqual([
      "fax",
      "email",
      "postal",
    ]);
    expect(result.entries[0]).toMatchObject({
      recipient: { phone: "+35242123456" },
    });
    expect(result.entries[0].senderId).toBeUndefined();
    expect(result.entries[0].options).toBeUndefined();
    expect(result.entries[1]).toMatchObject({
      recipient: { email: "email@example.invalid" },
      options: { kind: "transactional" },
    });
    expect(result.entries[2]).toMatchObject({
      recipient: records[2].data.address,
      senderId: "postal_fixture",
      options: { addressPosition: "right" },
    });
    for (const entry of result.entries) {
      expect(entry).not.toHaveProperty("channelField");
      expect(entry).not.toHaveProperty("recipientFieldsByChannel");
      expect(entry).not.toHaveProperty("senderIdsByChannel");
      expect(entry).not.toHaveProperty("optionsByChannel");
    }
    const prepare = vi.spyOn(domain, "prepareDispatch");
    await expect(
      service.prepareDistribution(
        owner,
        { jobId: generation.id, entries: [{ ...entries[0], channel: "fax" }] },
        "conflicting-channel",
      ),
    ).rejects.toThrow();
    await expect(
      service.prepareDistribution(
        owner,
        {
          jobId: generation.id,
          entries: [{ ...entries[0], recordId: "missing" }],
        },
        "missing-channel",
      ),
    ).rejects.toMatchObject({ code: "CHANNEL_FIELD_MISSING" });
    await expect(
      service.prepareDistribution(
        owner,
        {
          jobId: generation.id,
          entries: [{ ...entries[0], recordId: "invalid" }],
        },
        "invalid-channel",
      ),
    ).rejects.toMatchObject({ code: "CHANNEL_FIELD_INVALID" });
    await expect(
      service.prepareDistribution(
        owner,
        {
          jobId: generation.id,
          entries: [
            {
              ...entries[0],
              recordId: "email",
              recipientFieldsByChannel: { fax: { phone: "phone" } },
            },
          ],
        },
        "missing-channel-recipient",
      ),
    ).rejects.toMatchObject({ code: "RECIPIENT_CHANNEL_MAPPING_REQUIRED" });
    expect(prepare).not.toHaveBeenCalled();
    expect(await count("distribution_plans")).toBe(1);
    expect(await count("approvals")).toBe(0);
    expect(await count("outbox")).toBe(0);
  });
  it("creates all 500 records atomically through json_each and rejects 501 records and a fourth active job", async () => {
    const template = await published(),
      records = Array.from({ length: 500 }, (_, i) => ({
        recordId: `record-${i}`,
        data: { name: `Synthetic ${i}` },
      })),
      input = { templateId: template.id, mode: "generate_only", records };
    const created = await service.createGeneration(
      owner,
      input,
      "five-hundred",
    );
    expect(created.total).toBe(500);
    expect(await count("generation_records")).toBe(500);
    expect(
      (await service.generationResults(owner, created.id)).items,
    ).toHaveLength(50);
    await expect(
      service.createGeneration(
        owner,
        {
          ...input,
          records: [
            ...records,
            { recordId: "too-many", data: { name: "overflow" } },
          ],
        },
        "overflow",
      ),
    ).rejects.toThrow();
    await service.createGeneration(
      owner,
      { ...input, records: records.slice(0, 1) },
      "active-two",
    );
    await service.createGeneration(
      owner,
      { ...input, records: records.slice(0, 1) },
      "active-three",
    );
    await expect(
      service.createGeneration(
        owner,
        { ...input, records: records.slice(0, 1) },
        "active-four",
      ),
    ).rejects.toMatchObject({ code: "GENERATION_QUOTA" });
    expect(await count("generation_records")).toBe(502);
    expect(renders).toBe(0);
  });
  it("settles an exhausted crashed lease instead of leaving a job permanently running", async () => {
    const generation = await job([
      {
        recordId: "a",
        data: {
          name: "Alice",
          email: "alice@example.invalid",
          phone: "+35242123456",
        },
      },
    ]);
    await db
      .prepare(
        "UPDATE generation_records SET state='running',attempts=3,lease_token='crashed',lease_until='2020-01-01T00:00:00.000Z' WHERE job_id=?",
      )
      .bind(generation.id)
      .run();
    await service.processPending();
    expect((await service.getGeneration(owner, generation.id)).state).toBe(
      "failed",
    );
    expect(
      (await service.generationResults(owner, generation.id)).items[0]
        .errorCode,
    ).toBe("GENERATION_RETRY_EXHAUSTED");
    expect(renders).toBe(0);
  });
  it("persists 500 distribution entries atomically and resumes only three preparations per explicit request", async () => {
    const generation = await job();
    await service.processPending(2);
    const prepare = vi.spyOn(domain, "prepareDispatch");
    const input = {
      jobId: generation.id,
      entries: Array.from({ length: 500 }, (_, i) => ({
        entryId: `entry-${i}`,
        recordId: "a",
        channel: "fax",
        recipient: { phone: "+35242123456" },
      })),
    };
    const plan = await service.prepareDistribution(owner, input, "500-plan");
    expect(await count("distribution_entries")).toBe(500);
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(plan.pendingCount).toBe(497);
    expect(plan.errorCount).toBe(0);
    await service.getDistribution(owner, plan.id);
    expect(prepare).toHaveBeenCalledTimes(3);
    const resumed = await service.resumeDistribution(owner, plan.id);
    expect(resumed.pendingCount).toBe(494);
    expect(prepare).toHaveBeenCalledTimes(6);
    expect(resumed.manifestHash).toBe(plan.manifestHash);
    await expect(
      service.prepareDistribution(
        owner,
        { ...input, entries: [...input.entries, input.entries[0]] },
        "501-plan",
      ),
    ).rejects.toThrow();
    expect(await count("distribution_entries")).toBe(500);
    expect(await count("outbox")).toBe(0);
    expect(await count("reservations")).toBe(0);
  });
  it("attaches the existing postal preflight to frozen options without granting transfer or changing the manifest", async () => {
    const generation = await job();
    await service.processPending(2);
    const recipient = {
      name: "ATELIER EXEMPLE",
      line1: "Rue du Test 12",
      postalCode: "L-1234",
      city: "LUXEMBOURG",
      country: "LU",
    };
    const options = {
      deliveryProduct: "cheap",
      printMode: "simplex",
      printSpectrum: "grayscale",
    };
    const entry = {
      entryId: "postal",
      recordId: "a",
      channel: "postal",
      recipient,
      senderId: "workflow_postal_sender",
      ceilingMinor: 500,
      options,
    };
    await db
      .prepare(
        "INSERT OR IGNORE INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES('workflow_postal_sender','org_atelier','postal','Fixture','Return fixture','verified','production',?)",
      )
      .bind(new Date().toISOString())
      .run();
    const plan = await service.prepareDistribution(
      owner,
      { jobId: generation.id, entries: [entry] },
      "postal-plan",
    );
    const exact = plan.entries[0];
    // Synthetic scan proof and private renderer/provider-profile transport only: no ClamAV or live provider qualification.
    await db
      .prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        owner.organizationId,
        owner.userId,
        "document.scan_verified",
        exact.documentHash,
        JSON.stringify({ fixture: true }),
        new Date().toISOString(),
      )
      .run();
    const providerCalls: string[] = [];
    const postalEnv = {
      ...env,
      MODE: "production",
      ENVIRONMENT: "staging",
      PINGEN_SANDBOX: "true",
      PINGEN_CLIENT_ID: "fixture",
      PINGEN_CLIENT_SECRET: "fixture",
      PINGEN_ORGANIZATION_ID: "fixture_org",
      PINGEN_DEFAULT_COUNTRY: "LU",
      DOCUMENT_RENDERER: {
        fetch: async () =>
          Response.json({
            version: PINGEN_PREFLIGHT_VERSION,
            status: "blocked",
            sha256: exact.documentHash,
            pages: 1,
            canSend: false,
            issues: [{ code: "POSTAL_FONT_NOT_EMBEDDED" }],
            requiredReviews: [],
            rendering: { dpi: 144, complete: false, pages: [] },
            address: null,
          }),
      },
    } as unknown as Env;
    const postal = new PostalService(postalEnv, domain, {
      fetcher: async (url) => {
        providerCalls.push(String(url));
        if (String(url).endsWith("/auth/access-tokens"))
          return Response.json({
            access_token: "fixture",
            token_type: "Bearer",
            expires_in: 3600,
          });
        if (String(url).endsWith("/organisations/fixture_org"))
          return Response.json({
            data: {
              id: "fixture_org",
              type: "organisations",
              attributes: {
                billing_currency: "EUR",
                default_country: "LU",
                default_address_position: "left",
              },
            },
          });
        throw Error("Unexpected provider mutation");
      },
    });
    const authority = {
      context: owner,
      assertCurrent: async () => {},
      sql: () => ({ condition: "1=1", values: [] }),
    };
    const create = vi.fn(
      (
        input: import("../../packages/contracts/src/postal-review").PostalReviewInput,
        key: string,
      ) => postal.create(authority, input, key),
    );
    await expect(
      service.createDistributionPostalPreflight(
        member,
        plan.id,
        "postal",
        "member-key",
        create,
      ),
    ).rejects.toMatchObject({ code: "DISTRIBUTION_NOT_FOUND" });
    const attached = await service.createDistributionPostalPreflight(
      owner,
      plan.id,
      "postal",
      "preflight-key",
      create,
    );
    expect(attached.manifestHash).toBe(plan.manifestHash);
    expect(attached.entries[0]).toMatchObject({
      postalReviewStatus: "blocked",
      postalDispatchId: null,
      documentId: exact.documentId,
      documentHash: exact.documentHash,
    });
    expect(attached.entries[0].postalReviewId).toBeTruthy();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: exact.documentId,
        recipient,
        options,
        ceilingMinor: 500,
      }),
      `distribution:${plan.id}:postal`,
    );
    await service.createDistributionPostalPreflight(
      owner,
      plan.id,
      "postal",
      "new-key",
      create,
    );
    await service.getDistribution(owner, plan.id);
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      providerCalls.every(
        (url) =>
          url.endsWith("/auth/access-tokens") ||
          url.endsWith("/organisations/fixture_org"),
      ),
    ).toBe(true);
    expect(await count("postal_transfer_consents")).toBe(0);
    expect(await count("provider_drafts")).toBe(0);
    expect(await count("outbox")).toBe(0);
    expect(await count("reservations")).toBe(0);
    await expect(
      db
        .prepare(
          "UPDATE distribution_postal_reviews SET preflight_id='changed' WHERE plan_id=?",
        )
        .bind(plan.id)
        .run(),
    ).rejects.toThrow("immutable_distribution_postal_review");
    const incomplete = await service.prepareDistribution(
      owner,
      { jobId: generation.id, entries: [{ ...entry, options: undefined }] },
      "postal-incomplete",
    );
    await expect(
      service.createDistributionPostalPreflight(
        owner,
        incomplete.id,
        "postal",
        "invalid-options",
        create,
      ),
    ).rejects.toMatchObject({ code: "POSTAL_PLAN_OPTIONS_REQUIRED" });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("resumes interrupted preparation by stable keys without changing its immutable manifest", async () => {
    const generation = await job();
    await service.processPending(2);
    const input = {
      jobId: generation.id,
      entries: [
        {
          entryId: "a",
          recordId: "a",
          channel: "fax",
          recipient: { phone: "+35242123456" },
        },
      ],
    };
    vi.spyOn(domain, "prepareDispatch").mockRejectedValueOnce(
      new DomainError(
        "TEMPORARY_PREPARATION_FAILURE",
        "Synthetic interruption",
        503,
      ),
    );
    const first = await service.prepareDistribution(
      owner,
      input,
      "resume-plan",
    );
    expect(first.entries[0].errorCode).toBe("TEMPORARY_PREPARATION_FAILURE");
    expect(await count("dispatches")).toBe(0);
    const resumed = await service.prepareDistribution(
      owner,
      input,
      "resume-plan",
    );
    expect(resumed.id).toBe(first.id);
    expect(resumed.manifestHash).toBe(first.manifestHash);
    expect(resumed.entries[0].dispatchId).toBeTruthy();
    await service.prepareDistribution(owner, input, "resume-plan");
    expect(await count("dispatches")).toBe(1);
    expect(await count("reservations")).toBe(0);
    await expect(
      service.retryGeneration(owner, generation.id, ["a"]),
    ).rejects.toMatchObject({ code: "GENERATION_FROZEN" });
  });
  it("purges normalized generation data and duplicate artefacts after retention while retaining historical hashes", async () => {
    const generation = await job([
      {
        recordId: "a",
        data: {
          name: "Alice",
          email: "alice@example.invalid",
          phone: "+35242123456",
        },
      },
    ]);
    await service.processPending();
    const before = await db
      .prepare(
        "SELECT artifact_key,input_hash FROM generation_records WHERE job_id=?",
      )
      .bind(generation.id)
      .first<{ artifact_key: string; input_hash: string }>();
    await db
      .prepare(
        "UPDATE generation_records SET created_at='2020-01-01T00:00:00.000Z' WHERE job_id=?",
      )
      .bind(generation.id)
      .run();
    await maintainDocuments(env);
    const after = await db
      .prepare(
        "SELECT input_json,input_hash,artifact_key,data_purged_at FROM generation_records WHERE job_id=?",
      )
      .bind(generation.id)
      .first();
    expect(after).toMatchObject({
      input_json: "{}",
      input_hash: before!.input_hash,
      artifact_key: null,
    });
    expect(after!.data_purged_at).toBeTruthy();
    expect(await bucket.get(before!.artifact_key)).toBeNull();
  });
  it("uses the real MCP transport for template editing and read-only job status with dedicated scope rejection", async () => {
    const connect = async (scopes: string[]) => {
      const server = createGuteneoMcpServer(
        {
          context: { ...owner, actor: "mcp" },
          scopes,
          clientId: "fixture",
          token: "synthetic",
          expiresAt: 9999999999,
        },
        env,
        {
          domain,
          documents: service.documents,
          workflow: service,
          capabilities: () => ({ simulation: true }),
        },
      );
      const client = new Client({ name: "workflow-local-proof", version: "1" });
      const [c, s] = InMemoryTransport.createLinkedPair();
      await server.connect(s);
      await client.connect(c);
      return { client, server };
    };
    const full = await connect([...MCP_SCOPES]);
    try {
      const discovery = await full.client.listTools();
      const importer = discovery.tools.find(
        (tool) => tool.name === "import_dataset",
      )!;
      expect(importer.title).toBe("Importer un fichier de données");
      expect(JSON.stringify(importer.inputSchema)).toContain('"xml"');
      expect(importer.inputSchema.properties).toHaveProperty("xmlRecordPath");
      expect(discovery.tools.some((t) => t.name === "generate_documents")).toBe(
        true,
      );
      expect(
        discovery.tools.find((t) => t.name === "analyze_dataset")?.inputSchema
          .properties,
      ).toHaveProperty("proposeSchema");
      expect(
        discovery.tools.find((t) => t.name === "get_generation_job")
          ?.annotations?.readOnlyHint,
      ).toBe(false); // Current MCP reads record successful connection use.
      // These operations overwrite drafts, disable use, revoke access or cancel
      // pending work. Host safeguards cover those effects even when published
      // versions and already generated PDFs remain available.
      for (const name of [
        "update_template",
        "archive_template",
        "share_template",
        "cancel_generation_job",
      ]) {
        expect(
          discovery.tools.find((tool) => tool.name === name)?.annotations,
          name,
        ).toMatchObject({
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        });
      }
      for (const name of [
        "create_template",
        "publish_template",
        "duplicate_template",
      ]) {
        expect(
          discovery.tools.find((tool) => tool.name === name)?.annotations
            ?.destructiveHint,
          name,
        ).toBe(false);
      }
      const created = await full.client.callTool({
        name: "create_template",
        arguments: { envelope: envelope() },
      });
      const template = (
        created.structuredContent as { data: { id: string; revision: number } }
      ).data;
      const changed = await full.client.callTool({
        name: "update_template",
        arguments: {
          id: template.id,
          change: {
            expectedRevision: template.revision,
            patch: { op: "move_block", block: "name", x: 25, y: 45 },
          },
        },
      });
      expect(changed.isError).not.toBe(true);
      expect(
        (await service.getTemplate(owner, template.id)).envelope.definition
          .schemas[0][0].position,
      ).toEqual({ x: 25, y: 45 });
      expect(renders).toBe(0);
    } finally {
      await full.client.close();
      await full.server.close();
    }
    const limited = await connect(["documents:write"]);
    try {
      const rejected = await limited.client.callTool({
        name: "create_template",
        arguments: { envelope: envelope() },
      });
      expect(rejected.isError).toBe(true);
      expect(
        (rejected.structuredContent as { error: { code: string } }).error.code,
      ).toBe("INSUFFICIENT_SCOPE");
    } finally {
      await limited.client.close();
      await limited.server.close();
    }
  });
  it("preserves independent use/edit/publish/share rights and private sources across tenant boundaries", async () => {
    let template = await published();
    await expect(service.getTemplate(other, template.id)).rejects.toMatchObject(
      { code: "TEMPLATE_NOT_FOUND" },
    );
    await expect(
      service.getTemplate(member, template.id),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    template = await service.shareTemplate(owner, template.id, {
      expectedRevision: template.revision,
      visibility: "organization",
      syntheticSamplesConfirmed: true,
      grants: [],
    });
    expect(
      (await service.getTemplate(member, template.id)).permissions,
    ).toEqual({ use: true, edit: false, publish: false, share: false });
    await expect(
      service.publishTemplate(member, template.id, {
        expectedRevision: template.revision,
      }),
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    const source = await service.importDataset(owner, {
      name: "private.csv",
      format: "csv",
      bytes: new TextEncoder().encode(
        "id,nom,email\n01,Alice,alice@example.invalid",
      ),
    });
    await expect(service.getDataset(member, source.id)).rejects.toMatchObject({
      code: "DATASET_NOT_FOUND",
    });
    await expect(service.getDataset(other, source.id)).rejects.toMatchObject({
      code: "DATASET_NOT_FOUND",
    });
    expect((await service.listTemplates(member)).items).toHaveLength(1);
  });
  it("fences concurrent edits and freezes published versions/jobs independently of drafts", async () => {
    const template = await published();
    const input = {
      templateId: template.id,
      mode: "generate_only",
      records: [{ recordId: "a", data: { name: "Alice" } }],
    };
    const generation = await service.createGeneration(
      owner,
      input,
      "frozen-version",
    );
    const next = { ...template.envelope, name: "Nouvelle version" };
    const edits = await Promise.allSettled([
      service.updateTemplate(owner, template.id, {
        expectedRevision: template.revision,
        envelope: next,
      }),
      service.updateTemplate(owner, template.id, {
        expectedRevision: template.revision,
        envelope: { ...next, name: "Concurrent" },
      }),
    ]);
    expect(edits.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(edits.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      (await service.getTemplate(owner, template.id, 1)).envelope.name,
    ).toBe("Fixture éditable");
    expect(
      (await service.getGeneration(owner, generation.id)).templateVersion,
    ).toBe(1);
    await expect(
      db.prepare("UPDATE template_versions SET envelope_json='{}'").run(),
    ).rejects.toThrow("immutable_template_version");
  });
  it("reuses a validated private mapping on reordered columns without any AI invocation", async () => {
    const first = await service.importDataset(owner, {
      name: "one.csv",
      format: "csv",
      bytes: new TextEncoder().encode(
        "id,nom,email\n01,Alice,alice@example.invalid\n02,Bob,bob@example.invalid",
      ),
    });
    const profile = await service.getDatasetProfile(owner, first.id);
    const plan = { ...mapping, sourceSheet: profile.profile.sheets[0].name };
    const saved = await service.createMapping(owner, {
      datasetId: first.id,
      plan,
    });
    expect(
      (
        await service.validateMapping(owner, saved.id, {
          datasetId: first.id,
          version: 1,
        })
      ).status,
    ).toBe("ready");
    const second = await service.importDataset(owner, {
      name: "two.csv",
      format: "csv",
      bytes: new TextEncoder().encode(
        "email,id,nom\ncarol@example.invalid,03,Carol",
      ),
    });
    const template = await published();
    const generated = await service.createGeneration(
      owner,
      {
        templateId: template.id,
        mode: "generate_only",
        datasetId: second.id,
        mappingId: saved.id,
        mappingVersion: 1,
      },
      "reused-mapping",
    );
    expect(generated.total).toBe(1);
    const row = (await service.generationResults(owner, generated.id)).items[0];
    const proof = await service.generationProvenance(
      owner,
      generated.id,
      row.recordId,
    );
    expect(proof.sourceHash).toBe(second.sha256);
    expect(proof.mappingId).toBe(saved.id);
    expect(proof.provenance).toMatchObject({
      name: [{ sheet: plan.sourceSheet, row: 2, column: 3 }],
    });
    expect(proof.renderMetadata).toMatchObject({
      engine: "pdfme",
      engineVersion: "6.1.13",
      adapterVersion: "1",
    });
    expect(await count("workflow_ai_usage")).toBe(0);
    expect((await service.listMappings(owner)).items).toHaveLength(1);
  });
  it("does not silently reuse an incompatible mapping or accept missing required data", async () => {
    const source = await service.importDataset(owner, {
      name: "one.csv",
      format: "csv",
      bytes: new TextEncoder().encode(
        "id,nom,email\n01,Alice,alice@example.invalid",
      ),
    });
    const profile = await service.getDatasetProfile(owner, source.id),
      saved = await service.createMapping(owner, {
        datasetId: source.id,
        plan: { ...mapping, sourceSheet: profile.profile.sheets[0].name },
      });
    await service.validateMapping(owner, saved.id, {
      datasetId: source.id,
      version: 1,
    });
    const changed = await service.importDataset(owner, {
      name: "changed.csv",
      format: "csv",
      bytes: new TextEncoder().encode("id,nom,adresse\n01,Alice,Paris"),
    });
    expect(
      (
        await service.validateMapping(owner, saved.id, {
          datasetId: changed.id,
          version: 1,
        })
      ).status,
    ).toBe("needs_review");
    const template = await published();
    await expect(
      service.createGeneration(
        owner,
        {
          templateId: template.id,
          mode: "generate_only",
          datasetId: changed.id,
          mappingId: saved.id,
          mappingVersion: 1,
        },
        "changed",
      ),
    ).rejects.toMatchObject({ code: "MAPPING_REVIEW_REQUIRED" });
    await expect(
      service.createGeneration(
        owner,
        {
          templateId: template.id,
          mode: "generate_only",
          records: [{ recordId: "bad", data: {} }],
        },
        "missing",
      ),
    ).rejects.toMatchObject({ code: "TEMPLATE_REQUIRED_FIELD" });
  });
  it("deduplicates concurrent identical requests, claims each record once and keeps status reads pure", async () => {
    const template = await published(),
      input = {
        templateId: template.id,
        mode: "generate_only",
        records: [
          { recordId: "a", data: { name: "Alice" } },
          { recordId: "b", data: { name: "Bob" } },
        ],
      };
    const [a, b] = await Promise.all([
      service.createGeneration(owner, input, "same"),
      service.createGeneration(owner, input, "same"),
    ]);
    expect(a.id).toBe(b.id);
    await service.getGeneration(owner, a.id);
    await service.generationResults(owner, a.id);
    expect(renders).toBe(0);
    await Promise.all([service.processPending(2), service.processPending(2)]);
    expect(renders).toBe(2);
    expect((await service.getGeneration(owner, a.id)).state).toBe("completed");
    expect(await count("documents")).toBe(2);
    await expect(
      service.createGeneration(
        owner,
        { ...input, records: [{ recordId: "c", data: { name: "Changed" } }] },
        "same",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    for (const table of ["dispatches", "reservations", "outbox", "attempts"])
      expect(await count(table)).toBe(0);
  });
  it("binds unordered records to exact recipients and explicit multichannel without approving or reserving", async () => {
    const generation = await job();
    await service.processPending(2);
    const entries = [
      {
        entryId: "b-email",
        recordId: "b",
        channel: "email",
        recipientFields: { email: "email" },
        subject: "Exemple",
        text: "Contenu demandé",
      },
      {
        entryId: "a-email",
        recordId: "a",
        channel: "email",
        recipientFields: { email: "email" },
        subject: "Exemple",
        text: "Contenu demandé",
      },
    ];
    const distribution = await service.prepareDistribution(
      owner,
      { jobId: generation.id, entries },
      "individual",
    );
    expect(distribution.entries.map((e) => e.recipient.email)).toEqual([
      "bob@example.invalid",
      "alice@example.invalid",
    ]);
    expect(
      distribution.entries.every((e) => e.dispatchId && !e.errorCode),
    ).toBe(true);
    const common = await service.prepareDistribution(
      owner,
      {
        jobId: generation.id,
        entries: [
          {
            entryId: "a",
            recordId: "a",
            channel: "fax",
            recipient: { phone: "+35242123456" },
          },
          {
            entryId: "b",
            recordId: "b",
            channel: "fax",
            recipient: { phone: "+35242123456" },
          },
        ],
      },
      "common",
    );
    expect(new Set(common.entries.map((e) => e.dispatchId)).size).toBe(2);
    await expect(
      service.prepareDistribution(
        owner,
        {
          jobId: generation.id,
          entries: [
            entries[0],
            {
              entryId: "b-fax",
              recordId: "b",
              channel: "fax",
              recipientFields: { phone: "phone" },
            },
          ],
        },
        "multichannel-without-optin",
      ),
    ).rejects.toMatchObject({ code: "MULTICHANNEL_CONSENT_REQUIRED" });
    const multi = await service.prepareDistribution(
      owner,
      {
        jobId: generation.id,
        explicitMultichannel: true,
        entries: [
          entries[0],
          {
            entryId: "b-fax",
            recordId: "b",
            channel: "fax",
            recipientFields: { phone: "phone" },
          },
        ],
      },
      "multichannel",
    );
    expect(multi.entries.every((e) => e.dispatchId)).toBe(true);
    for (const table of ["approvals", "reservations", "outbox", "attempts"])
      expect(await count(table)).toBe(0);
    await expect(
      db.prepare("UPDATE distribution_plans SET manifest_json='[]'").run(),
    ).rejects.toThrow("immutable_distribution_plan");
  });
  it("retries only failed records and reuses already rendered exact bytes", async () => {
    const generation = await job([
      {
        recordId: "a",
        data: {
          name: "Alice",
          email: "alice@example.invalid",
          phone: "+35242123456",
        },
      },
    ]);
    vi.spyOn(service.documents, "upload").mockRejectedValueOnce(
      new DomainError("SCAN_TEMPORARY", "Synthetic scan failure", 503),
    );
    await service.processPending();
    expect((await service.getGeneration(owner, generation.id)).state).toBe(
      "failed",
    );
    expect(renders).toBe(1);
    await service.retryGeneration(owner, generation.id, ["a"]);
    await service.processPending();
    expect((await service.getGeneration(owner, generation.id)).state).toBe(
      "completed",
    );
    expect(renders).toBe(1);
    expect(await count("documents")).toBe(1);
  });
  it("lets cancellation win when it commits between retry's job read and record writes", async () => {
    const generation = await job([
      {
        recordId: "a",
        data: {
          name: "Retry cancellation fixture",
          email: "retry@example.invalid",
          phone: "+35242123456",
        },
      },
    ]);
    vi.spyOn(service.documents, "upload").mockRejectedValueOnce(
      new DomainError("SCAN_TEMPORARY", "Synthetic scan failure", 503),
    );
    await service.processPending(1);
    expect(await service.getGeneration(owner, generation.id)).toMatchObject({
      state: "failed",
      failed: 1,
      pending: 0,
    });
    const internals = service as unknown as {
      jobRow(ctx: ActorContext, id: string): Promise<{ state: string }>;
    };
    const originalJobRow = internals.jobRow.bind(service);
    let interleaved = false;
    const jobRead = vi
      .spyOn(internals, "jobRow")
      .mockImplementationOnce(async (ctx, id) => {
        const snapshot = await originalJobRow(ctx, id);
        // Return the pre-cancellation read while cancellation commits before retry's record mutation.
        const cancelled = await service.cancelGeneration(owner, generation.id);
        expect(cancelled).toMatchObject({ state: "cancelled", pending: 0 });
        interleaved = true;
        return snapshot;
      });
    try {
      const result = await service.retryGeneration(owner, generation.id, ["a"]);
      expect(interleaved).toBe(true);
      expect(result).toMatchObject({
        state: "cancelled",
        failed: 1,
        pending: 0,
      });
      expect(
        (await service.generationResults(owner, generation.id)).items,
      ).toEqual([
        expect.objectContaining({
          recordId: "a",
          state: "failed",
          attempts: 1,
        }),
      ]);
      expect(await service.processPending(1)).toEqual({ processed: 0 });
      expect((await service.getGeneration(owner, generation.id)).pending).toBe(
        0,
      );
      expect(renders).toBe(1);
      expect(await count("documents")).toBe(0);
      await expect(
        service.retryGeneration(owner, generation.id, ["a"]),
      ).rejects.toMatchObject({ code: "GENERATION_CANCELLED" });
    } finally {
      jobRead.mockRestore();
    }
  });
  it("cancels a running render before document registration and prevents duplicate work", async () => {
    let resolveRender!: (value: Response) => void;
    env.DOCUMENT_RENDERER = {
      fetch: async () =>
        new Promise<Response>((resolve) => {
          resolveRender = resolve;
        }),
    } as unknown as Fetcher;
    const generation = await job();
    const processing = service.processPending(1);
    await vi.waitFor(() => expect(resolveRender).toBeTypeOf("function"));
    await service.cancelGeneration(owner, generation.id);
    resolveRender(new Response(await pdf("Cancelled")));
    await processing;
    expect((await service.getGeneration(owner, generation.id)).state).toBe(
      "cancelled",
    );
    expect(await count("documents")).toBe(0);
    await service.processPending();
    expect(
      (await service.generationResults(owner, generation.id)).items.every(
        (r) => r.state === "cancelled",
      ),
    ).toBe(true);
  });
  it("rechecks cancellation after a slow synthetic scanner before private PDF registration", async () => {
    await db
      .prepare("UPDATE organizations SET mode='production' WHERE id=?")
      .bind(owner.organizationId)
      .run();
    try {
      let finishScan!: (value: Response) => void;
      let scannedHash = "";
      const production = {
        ...env,
        MODE: "production" as const,
        ENVIRONMENT: "production" as const,
        DOCUMENT_RENDERER: {
          fetch: async (request: Request) =>
            new URL(request.url).pathname === "/validate"
              ? Response.json({ pages: 1 })
              : new Response(await pdf("Private scan fixture")),
        },
        SCANNER: {
          fetch: async (request: Request) => {
            scannedHash = await sha256(
              new Uint8Array(await request.arrayBuffer()),
            );
            return new Promise<Response>((resolve) => {
              finishScan = resolve;
            });
          },
        },
      } as unknown as Env;
      const workflow = new TemplateWorkflowService(
        production,
        new DomainService(db, { mode: "production" }),
      );
      const template = await workflow.createTemplate(owner, {
        envelope: envelope(),
      });
      await workflow.publishTemplate(owner, template.id, {
        expectedRevision: template.revision,
      });
      const generation = await workflow.createGeneration(
        owner,
        {
          templateId: template.id,
          mode: "generate_only",
          records: [
            { recordId: "scan", data: { name: "Private scan fixture" } },
          ],
        },
        "cancel-during-scan",
      );
      const processing = workflow.processPending(1);
      await vi.waitFor(() => expect(finishScan).toBeTypeOf("function"));
      await workflow.cancelGeneration(owner, generation.id);
      finishScan(Response.json({ verdict: "clean", sha256: scannedHash }));
      await processing;
      expect(await count("documents")).toBe(0);
      expect((await workflow.getGeneration(owner, generation.id)).state).toBe(
        "cancelled",
      );
      expect(await count("outbox")).toBe(0);
    } finally {
      await db
        .prepare("UPDATE organizations SET mode='simulation' WHERE id=?")
        .bind(owner.organizationId)
        .run();
    }
  });
  it("rechecks revoked current membership before asynchronous rendering", async () => {
    const template = await published(member);
    const generation = await service.createGeneration(
      member,
      {
        templateId: template.id,
        mode: "generate_only",
        records: [{ recordId: "a", data: { name: "Member" } }],
      },
      "revoked",
    );
    await db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
      .bind(member.organizationId, member.userId)
      .run();
    await service.processPending();
    expect(renders).toBe(0);
    const record = await db
      .prepare("SELECT state,error_code FROM generation_records WHERE job_id=?")
      .bind(generation.id)
      .first();
    expect(record).toMatchObject({ state: "failed", error_code: "FORBIDDEN" });
  });
  it("proposes a synthetic business schema over REST only after consent, with one bounded AI call and no implicit adoption", async () => {
    const source = await service.importDataset(owner, {
      name: "customers.csv",
      format: "csv",
      bytes: new TextEncoder().encode(
        "id,name\n001,Private Alpha\n002,Private Beta\n003,Private Gamma\n004,Private Delta",
      ),
    });
    env.DATASET_OPENAI_API_KEY = "synthetic-not-a-secret";
    env.DATASET_OPENAI_MODEL = "synthetic-contract-model";
    await expect(
      service.analyzeDataset(owner, source.id, { proposeSchema: true }),
    ).rejects.toMatchObject({ code: "AI_TRANSFER_NOT_AUTHORIZED" });
    expect(await count("workflow_ai_usage")).toBe(0);
    await service.setAiPolicy(owner, {
      enabled: true,
      transferApproved: true,
      dailyLimit: 1,
    });
    await expect(
      service.analyzeDataset(member, source.id, { proposeSchema: true }),
    ).rejects.toMatchObject({ code: "DATASET_NOT_FOUND" });
    expect(await count("workflow_ai_usage")).toBe(0);
    const proposal = {
      name: "Synthetic customers",
      sourceSheet: "Données",
      headerRow: 1,
      recordKey: ["id"],
      fields: [
        {
          source: "name",
          target: "customer.name",
          type: "text",
          required: true,
          dateOrder: null,
          decimalSeparator: null,
          scale: null,
        },
      ],
      group: null,
      joins: [],
      ambiguities: [],
    };
    const originalFetch = globalThis.fetch;
    const inference = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        if (String(input) !== "https://api.openai.com/v1/responses")
          return originalFetch(input, init);
        const payload = JSON.parse(String(init?.body));
        expect(payload.store).toBe(false);
        expect(payload.tools).toEqual([]);
        return Response.json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: JSON.stringify(proposal) },
              ],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 60 },
        });
      });
    try {
      const app = new Hono<{
        Bindings: Env;
        Variables: { actor: ActorContext };
      }>();
      app.use("*", async (c, next) => {
        c.set("actor", owner);
        await next();
      });
      app.route(
        "/",
        createTemplateWorkflowRoutes(() => domain),
      );
      const response = await app.request(
        `/api/datasets/${source.id}/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction: "Proposer un courrier client",
            proposeSchema: true,
          }),
        },
        env,
      );
      expect(response.status).toBe(200);
      const result = (await response.json()) as {
        status: string;
        validation: { examples: unknown[]; records?: unknown };
        schemaSuggestion: {
          envelope: ReturnType<typeof envelope>;
          fields: Array<{ path: string }>;
        };
        usage: { calls: number };
      };
      expect(result.status).toBe("needs_review");
      expect(result.validation.examples).toHaveLength(3);
      expect(result.validation.records).toBeUndefined();
      expect(result.schemaSuggestion.fields).toContainEqual(
        expect.objectContaining({ path: "customer.name" }),
      );
      expect(JSON.stringify(result.schemaSuggestion.envelope)).not.toContain(
        "Private Alpha",
      );
      expect(result.usage.calls).toBe(1);
      expect(await count("document_templates")).toBe(0);
      expect(await count("workflow_mappings")).toBe(0);
      expect(await count("generation_jobs")).toBe(0);
      expect(await count("dispatches")).toBe(0);
      expect(await count("reservations")).toBe(0);
      await expect(
        service.analyzeDataset(owner, source.id, { proposeSchema: true }),
      ).rejects.toMatchObject({ code: "AI_BUDGET_EXHAUSTED" });
      expect(
        inference.mock.calls.filter(
          ([url]) => String(url) === "https://api.openai.com/v1/responses",
        ),
      ).toHaveLength(1);
      const adopted = await service.createTemplate(owner, {
        envelope: result.schemaSuggestion.envelope,
      });
      expect(adopted.state).toBe("draft");
      expect(await count("template_versions")).toBe(0);
      expect(await count("documents")).toBe(0);
    } finally {
      inference.mockRestore();
    }
  });
  it("requires explicit configured AI access and never lets an assistant grant organization transfer consent", async () => {
    const source = await service.importDataset(owner, {
      name: "data.json",
      format: "json",
      bytes: new TextEncoder().encode('[{"name":"Exemple"}]'),
    });
    await expect(
      service.analyzeDataset(owner, source.id, {}),
    ).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
    await expect(
      service.setAiPolicy(
        { ...owner, actor: "mcp" },
        { enabled: true, transferApproved: true, dailyLimit: 2 },
      ),
    ).rejects.toMatchObject({ code: "HUMAN_ADMIN_REQUIRED" });
    expect(await count("workflow_ai_usage")).toBe(0);
  });
  it("keeps unscanned production originals quarantined and profile reads do not retry the scanner", async () => {
    await db
      .prepare(
        "UPDATE organizations SET mode='production' WHERE id='org_atelier'",
      )
      .run();
    try {
      const production = {
        ...env,
        MODE: "production" as const,
        ENVIRONMENT: "production" as const,
        SCANNER: undefined,
      } as Env;
      const workflow = new TemplateWorkflowService(
        production,
        new DomainService(db, { mode: "production" }),
      );
      const source = await workflow.importDataset(owner, {
        name: "source.csv",
        format: "csv",
        bytes: new TextEncoder().encode("id;name\n01;Example"),
        delimiter: ";",
      });
      expect(source).toMatchObject({
        status: "quarantined",
        errorCode: "SOURCE_SCAN_REQUIRED",
      });
      await expect(
        workflow.getDatasetProfile(owner, source.id),
      ).rejects.toMatchObject({ code: "DATASET_NOT_READY" });
      expect(
        (await workflow.getDataset(owner, source.id)).analysis,
      ).toMatchObject({ attempts: 1, canRetry: true, running: false });
      await expect(
        workflow.retryDatasetAnalysis(member, source.id),
      ).rejects.toMatchObject({ code: "DATASET_NOT_FOUND" });
      let finish!: (value: Response) => void;
      let scans = 0;
      production.SCANNER = {
        fetch: async (request: Request) => {
          scans++;
          expect(new TextDecoder().decode(await request.arrayBuffer())).toBe(
            "id;name\n01;Example",
          );
          return new Promise<Response>((resolve) => {
            finish = resolve;
          });
        },
      } as unknown as Fetcher;
      const retry = workflow.retryDatasetAnalysis(owner, source.id);
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      expect(
        (await workflow.retryDatasetAnalysis(owner, source.id)).analysis,
      ).toMatchObject({ attempts: 2, running: true, canRetry: false });
      expect(scans).toBe(1);
      finish(Response.json({ verdict: "clean", sha256: source.sha256 }));
      const recovered = await retry;
      expect(recovered).toMatchObject({
        id: source.id,
        sha256: source.sha256,
        status: "ready",
        errorCode: null,
        analysis: { attempts: 2, canRetry: false, running: false },
      });
      expect(
        (await workflow.getDatasetProfile(owner, source.id)).profile.sheets[0]
          .rows[0].cells,
      ).toHaveLength(2);
      await workflow.retryDatasetAnalysis(owner, source.id);
      expect(scans).toBe(1);
      production.SCANNER = undefined;
      const failure = await workflow.importDataset(owner, {
        name: "blocked.csv",
        format: "csv",
        bytes: new TextEncoder().encode("id,name\n02,Example"),
      });
      await workflow.retryDatasetAnalysis(owner, failure.id);
      await workflow.retryDatasetAnalysis(owner, failure.id);
      expect(
        (await workflow.getDataset(owner, failure.id)).analysis,
      ).toMatchObject({ attempts: 3, canRetry: false });
      await expect(
        workflow.retryDatasetAnalysis(owner, failure.id),
      ).rejects.toMatchObject({ code: "DATASET_RETRY_EXHAUSTED" });
      await expect(
        db
          .prepare(
            "UPDATE workflow_datasets SET parsing_options_json='{}' WHERE id=?",
          )
          .bind(source.id)
          .run(),
      ).rejects.toThrow("immutable_dataset_parsing_options");
    } finally {
      await db
        .prepare(
          "UPDATE organizations SET mode='simulation' WHERE id='org_atelier'",
        )
        .run();
    }
  });
  it("routes generation cancellation through dedicated scopes and exposes the same template service over HTTP", async () => {
    expect(
      templateWorkflowScope("/api/generation-jobs/gen/cancel", "POST"),
    ).toBe("generations:write");
    expect(templateWorkflowScope("/api/templates/tpl/publish", "POST")).toBe(
      "templates:publish",
    );
    expect(templateWorkflowScope("/api/templates/tpl/share", "POST")).toBe(
      "templates:share",
    );
    const app = new Hono<{
      Bindings: Env;
      Variables: { actor: ActorContext };
    }>();
    app.use("*", async (c, next) => {
      c.set("actor", owner);
      await next();
    });
    app.route(
      "/",
      createTemplateWorkflowRoutes(() => domain),
    );
    const response = await app.request(
      "/api/templates",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ envelope: envelope() }),
      },
      env,
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string };
    expect((await service.getTemplate(owner, body.id)).name).toBe(
      "Fixture éditable",
    );
  });
});
