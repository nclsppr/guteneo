import { z } from "zod";
import { ContentError } from "../../../packages/contracts/src/content";
import { getTemplateValue } from "../../../packages/contracts/src/templates";
import type {
  GenerationRecordContext,
  GenerationCorrectionInput,
} from "../../../packages/contracts/src/generation-context";
import type {
  TemplateWorkflowService,
  WorkflowActor,
} from "./template-workflow";
import type { Env } from "./env";

function fail(code: string, message: string, status: 403 | 404): never {
  throw new ContentError(code, message, status);
}

export async function generationRecordContext(
  env: Env,
  workflow: TemplateWorkflowService,
  ctx: WorkflowActor,
  id: string,
  recordId?: string,
  cursor?: string,
  limit = 50,
): Promise<
  | { items: GenerationRecordContext[]; nextCursor: string | null }
  | GenerationCorrectionInput
> {
  if (ctx.actor !== "browser")
    fail("BROWSER_REQUIRED", "Open this private generation in Guteneo.", 403);
  await workflow.getGeneration(ctx, id);
  if (recordId !== undefined) z.string().min(1).max(200).parse(recordId);
  if (cursor !== undefined) z.string().min(1).max(200).parse(cursor);
  limit = Number.isFinite(limit)
    ? Math.max(1, Math.min(50, Math.floor(limit)))
    : 50;
  const rows = await env.DB.prepare(
    "SELECT r.record_id,r.input_json FROM generation_records r JOIN generation_jobs j ON j.organization_id=r.organization_id AND j.id=r.job_id AND j.owner_id=? JOIN memberships m ON m.organization_id=j.organization_id AND m.user_id=j.owner_id AND m.role=? AND (m.role<>'supervisor' OR (m.supervisor_can_approve=? AND m.supervisor_can_report=?)) JOIN organizations o ON o.id=m.organization_id AND o.mode=? WHERE r.organization_id=? AND r.job_id=? AND (? IS NULL OR r.record_id=?) AND r.record_id>? ORDER BY r.record_id LIMIT ?",
  )
    .bind(
      ctx.userId,
      ctx.role,
      Number(Boolean(ctx.supervisorCanApprove)),
      Number(Boolean(ctx.supervisorCanReport)),
      env.MODE,
      ctx.organizationId,
      id,
      recordId ?? null,
      recordId ?? null,
      recordId === undefined ? (cursor ?? "") : "",
      recordId === undefined ? limit + 1 : 1,
    )
    .all<{ record_id: string; input_json: string }>();
  if (!rows.results.length) await workflow.getGeneration(ctx, id);
  const contexts = rows.results.slice(0, limit).map((row) => {
    const data = JSON.parse(row.input_json) as Record<string, unknown>;
    const text = (paths: string[], max: number, firstLine = false) => {
      for (const path of paths) {
        const value = getTemplateValue(data, path);
        if (typeof value === "string" || typeof value === "number") {
          const source = firstLine
            ? String(value).split(/\r?\n/)[0]
            : String(value);
          const result = source.replace(/\s+/g, " ").trim();
          if (result) return result.slice(0, max);
        }
      }
      return null;
    };
    const context: GenerationRecordContext = {
      recordId: row.record_id,
      name: text(
        [
          "recipient.name",
          "recipient.fullName",
          "customer.name",
          "person.name",
          "recipientName",
          "customerName",
          "fullName",
          "name",
          "nom",
          "destinataire.nom",
          "destinataireNom",
          "destinataire_nom",
          "recipient.address",
        ],
        120,
        true,
      ),
      subject: text(
        ["subject", "objet", "letter.subject", "courrier.objet"],
        160,
      ),
      reference: text(
        [
          "reference",
          "customerReference",
          "clientReference",
          "ref",
          "numero",
          "customer.reference",
          "recipient.reference",
        ],
        80,
      ),
    };
    return { context, data };
  });
  if (recordId !== undefined) {
    if (!contexts.length)
      fail("GENERATION_RECORD_NOT_FOUND", "Record not found.", 404);
    return { ...contexts[0].context, data: contexts[0].data };
  }
  return {
    items: contexts.map(({ context }) => context),
    nextCursor:
      rows.results.length > limit ? rows.results[limit - 1].record_id : null,
  };
}
