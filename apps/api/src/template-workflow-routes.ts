import { Hono } from "hono";
import { z } from "zod";
import { XmlRecordPathSchema } from "../../../packages/contracts/src/datasets";
import type { DomainService } from "../../../packages/domain/src/index";
import { ContentError } from "../../../packages/contracts/src/content";
import type { Env } from "./env";
import type { PostalAuthority } from "./postal-authority";
import { PostalService } from "./postal";
import {
  TemplateWorkflowService,
  type WorkflowActor,
} from "./template-workflow";

export function createTemplateWorkflowRoutes(
  domain: (env: Env) => DomainService,
  postalAuthority?: (
    request: Request,
    env: Env,
    scope: string,
  ) => Promise<PostalAuthority>,
) {
  const app = new Hono<{
    Bindings: Env;
    Variables: { actor: WorkflowActor };
  }>();
  const service = (env: Env) => new TemplateWorkflowService(env, domain(env));
  const key = (value: string | undefined) => {
    if (!value)
      throw new ContentError(
        "IDEMPOTENCY_REQUIRED",
        "En-tête Idempotency-Key requis.",
      );
    return value;
  };
  const page = (url: string) => {
    const p = new URL(url).searchParams;
    return [
      p.get("cursor") ?? undefined,
      Number(p.get("limit") ?? 30),
    ] as const;
  };
  app.get("/api/templates", async (c) =>
    c.json(
      await service(c.env).listTemplates(c.get("actor"), ...page(c.req.url)),
    ),
  );
  app.post("/api/templates", async (c) =>
    c.json(
      await service(c.env).createTemplate(c.get("actor"), await c.req.json()),
      201,
    ),
  );
  app.post("/api/templates/import-docx", async (c) => {
    const form = await c.req.raw.formData(),
      file = form.get("file");
    if (!file || typeof file === "string")
      throw new ContentError(
        "FILE_REQUIRED",
        "Choisissez un fichier Word .docx.",
      );
    return c.json(
      await service(c.env).importDocx(c.get("actor"), {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }),
      201,
    );
  });
  app.get("/api/templates/:id", async (c) =>
    c.json(
      await service(c.env).getTemplate(
        c.get("actor"),
        c.req.param("id"),
        c.req.query("version") ? Number(c.req.query("version")) : undefined,
      ),
    ),
  );
  app.patch("/api/templates/:id", async (c) =>
    c.json(
      await service(c.env).updateTemplate(
        c.get("actor"),
        c.req.param("id"),
        await c.req.json(),
      ),
    ),
  );
  app.post("/api/templates/:id/publish", async (c) =>
    c.json(
      await service(c.env).publishTemplate(
        c.get("actor"),
        c.req.param("id"),
        await c.req.json(),
      ),
    ),
  );
  app.post("/api/templates/:id/duplicate", async (c) =>
    c.json(
      await service(c.env).duplicateTemplate(c.get("actor"), c.req.param("id")),
      201,
    ),
  );
  app.post("/api/templates/:id/share", async (c) =>
    c.json(
      await service(c.env).shareTemplate(
        c.get("actor"),
        c.req.param("id"),
        await c.req.json(),
      ),
    ),
  );
  app.get("/api/templates/:id/sharing", async (c) =>
    c.json(
      await service(c.env).getTemplateSharing(
        c.get("actor"),
        c.req.param("id"),
      ),
    ),
  );
  app.post("/api/templates/:id/archive", async (c) =>
    c.json(
      await service(c.env).archiveTemplate(
        c.get("actor"),
        c.req.param("id"),
        await c.req.json(),
      ),
    ),
  );
  app.post("/api/templates/:id/preview", async (c) =>
    c.json(
      await service(c.env).previewTemplate(
        c.get("actor"),
        c.req.param("id"),
        await c.req.json(),
      ),
      201,
    ),
  );
  app.post("/api/templates/:id/suggest", async (c) =>
    c.json(
      await service(c.env).suggestTemplate(
        c.get("actor"),
        c.req.param("id"),
        await c.req.json(),
      ),
    ),
  );
  app.get("/api/templates/:id/schema", async (c) =>
    c.json(
      (
        await service(c.env).getTemplate(
          c.get("actor"),
          c.req.param("id"),
          c.req.query("version") ? Number(c.req.query("version")) : undefined,
        )
      ).envelope.inputSchema,
    ),
  );
  app.get("/api/datasets", async (c) =>
    c.json(
      await service(c.env).listDatasets(c.get("actor"), ...page(c.req.url)),
    ),
  );
  app.post("/api/datasets", async (c) => {
    if (c.req.header("Content-Type")?.includes("multipart/form-data")) {
      const form = await c.req.raw.formData(),
        file = form.get("file");
      if (!file || typeof file === "string")
        throw new ContentError(
          "FILE_REQUIRED",
          "Choisissez un fichier XML, CSV, XLSX ou JSON.",
        );
      const format = z
        .enum(["csv", "xlsx", "json", "xml"])
        .parse(form.get("format") ?? file.name.toLowerCase().split(".").at(-1));
      const encoding = z
        .enum(["utf-8", "windows-1252"])
        .optional()
        .parse(form.get("encoding") ?? undefined);
      const delimiter = z
        .enum([",", ";", "\t", "|"])
        .optional()
        .parse(form.get("delimiter") ?? undefined);
      return c.json(
        await service(c.env).importDataset(c.get("actor"), {
          name: file.name,
          format,
          encoding,
          delimiter,
          xmlRecordPath: XmlRecordPathSchema.optional().parse(
            form.get("xmlRecordPath") ?? undefined,
          ),
          bytes: new Uint8Array(await file.arrayBuffer()),
        }),
        201,
      );
    }
    const input = z
      .object({
        name: z.string().min(1).max(180),
        format: z.literal("json"),
        data: z.unknown(),
      })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await service(c.env).importDataset(c.get("actor"), {
        name: input.name,
        format: "json",
        bytes: new TextEncoder().encode(JSON.stringify(input.data)),
      }),
      201,
    );
  });
  app.get("/api/datasets/:id", async (c) =>
    c.json(await service(c.env).getDataset(c.get("actor"), c.req.param("id"))),
  );
  app.post("/api/datasets/:id/retry-analysis", async (c) => {
    z.object({})
      .strict()
      .parse(await c.req.json());
    return c.json(
      await service(c.env).retryDatasetAnalysis(
        c.get("actor"),
        c.req.param("id"),
      ),
    );
  });
  app.get("/api/datasets/:id/profile", async (c) =>
    c.json(
      await service(c.env).datasetProfilePage(
        c.get("actor"),
        c.req.param("id"),
        c.req.query("sheet"),
        Number(c.req.query("cursor") ?? 0),
        Number(c.req.query("limit") ?? 30),
      ),
    ),
  );
  app.post("/api/datasets/:id/analyze", async (c) =>
    c.json(
      await service(c.env).analyzeDataset(
        c.get("actor"),
        c.req.param("id"),
        await c.req.json(),
      ),
    ),
  );
  app.get("/api/dataset-ai-policy", async (c) =>
    c.json(await service(c.env).getAiPolicy(c.get("actor"))),
  );
  app.put("/api/dataset-ai-policy", async (c) =>
    c.json(
      await service(c.env).setAiPolicy(c.get("actor"), await c.req.json()),
    ),
  );
  app.get("/api/mappings", async (c) =>
    c.json(
      await service(c.env).listMappings(c.get("actor"), ...page(c.req.url)),
    ),
  );
  app.post("/api/mappings", async (c) =>
    c.json(
      await service(c.env).createMapping(c.get("actor"), await c.req.json()),
      201,
    ),
  );
  app.get("/api/mappings/:id", async (c) =>
    c.json(
      await service(c.env).getMapping(
        c.get("actor"),
        c.req.param("id"),
        c.req.query("version") ? Number(c.req.query("version")) : undefined,
      ),
    ),
  );
  app.post("/api/mappings/:id/validate", async (c) =>
    c.json(
      await service(c.env).validateMapping(
        c.get("actor"),
        c.req.param("id"),
        await c.req.json(),
      ),
    ),
  );
  app.get("/api/generation-jobs", async (c) =>
    c.json(
      await service(c.env).listGenerations(c.get("actor"), ...page(c.req.url)),
    ),
  );
  app.post("/api/generation-jobs", async (c) => {
    const workflow = service(c.env);
    const job = await workflow.createGeneration(
      c.get("actor"),
      await c.req.json(),
      key(c.req.header("Idempotency-Key")),
    );
    c.executionCtx.waitUntil(workflow.processPending().then(() => undefined));
    return c.json(job, 202);
  });
  app.get("/api/generation-jobs/:id", async (c) =>
    c.json(
      await service(c.env).getGeneration(c.get("actor"), c.req.param("id")),
    ),
  );
  app.get("/api/generation-jobs/:id/results", async (c) =>
    c.json(
      await service(c.env).generationResults(
        c.get("actor"),
        c.req.param("id"),
        ...page(c.req.url),
      ),
    ),
  );
  app.get("/api/generation-jobs/:id/provenance", async (c) =>
    c.json(
      await service(c.env).generationProvenance(
        c.get("actor"),
        c.req.param("id"),
        z.string().min(1).max(200).parse(c.req.query("recordId")),
      ),
    ),
  );
  app.post("/api/generation-jobs/:id/cancel", async (c) =>
    c.json(
      await service(c.env).cancelGeneration(c.get("actor"), c.req.param("id")),
    ),
  );
  app.post("/api/generation-jobs/:id/retry", async (c) => {
    const { recordIds } = z
      .object({
        recordIds: z.array(z.string().min(1).max(200)).min(1).max(500),
      })
      .strict()
      .parse(await c.req.json());
    const workflow = service(c.env),
      job = await workflow.retryGeneration(
        c.get("actor"),
        c.req.param("id"),
        recordIds,
      );
    c.executionCtx.waitUntil(workflow.processPending().then(() => undefined));
    return c.json(job, 202);
  });
  app.post("/api/distribution-plans", async (c) =>
    c.json(
      await service(c.env).prepareDistribution(
        c.get("actor"),
        await c.req.json(),
        key(c.req.header("Idempotency-Key")),
      ),
      201,
    ),
  );
  app.post("/api/distribution-plans/:id/resume", async (c) => {
    const { retryFailed } = z
      .object({ retryFailed: z.boolean().default(false) })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await service(c.env).resumeDistribution(
        c.get("actor"),
        c.req.param("id"),
        retryFailed,
      ),
    );
  });
  app.post(
    "/api/distribution-plans/:id/entries/:entryId/postal-preflight",
    async (c) => {
      z.object({})
        .strict()
        .parse(await c.req.json());
      if (!postalAuthority)
        throw new ContentError(
          "POSTAL_AUTHORITY_REQUIRED",
          "Autorité postale indisponible.",
        );
      const authority = await postalAuthority(
        c.req.raw,
        c.env,
        "documents:write",
      );
      return c.json(
        await service(c.env).createDistributionPostalPreflight(
          c.get("actor"),
          c.req.param("id"),
          c.req.param("entryId"),
          key(c.req.header("Idempotency-Key")),
          (input, key) =>
            new PostalService(c.env, domain(c.env)).create(
              authority,
              input,
              key,
            ),
        ),
        201,
      );
    },
  );
  app.get("/api/distribution-plans/:id", async (c) =>
    c.json(
      await service(c.env).getDistribution(c.get("actor"), c.req.param("id")),
    ),
  );
  return app;
}

export function templateWorkflowScope(
  path: string,
  method: string,
): string | null {
  const read = method === "GET" || method === "HEAD";
  if (path.startsWith("/api/templates")) {
    if (path.endsWith("/share") || path.endsWith("/sharing"))
      return "templates:share";
    if (path.endsWith("/publish") || path.endsWith("/archive"))
      return "templates:publish";
    if (path.endsWith("/preview")) return "generations:write";
    return read ? "templates:read" : "templates:write";
  }
  if (
    path.startsWith("/api/datasets") ||
    path.startsWith("/api/mappings") ||
    path.startsWith("/api/dataset-ai-policy")
  )
    return read ? "datasets:read" : "datasets:write";
  if (path.startsWith("/api/generation-jobs"))
    return read ? "generations:read" : "generations:write";
  if (path.startsWith("/api/distribution-plans"))
    return read ? "dispatches:read" : "dispatches:prepare";
  return null;
}
