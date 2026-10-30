import { z } from "zod";
import { ContentError } from "../../../packages/contracts/src/content";
import { getTemplateValue } from "../../../packages/contracts/src/templates";
import { workspacePermissions } from "../../../packages/contracts/src/roles";
import type {
  GenerationContextPage,
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
): Promise<GenerationContextPage | GenerationCorrectionInput> {
  if (ctx.actor !== "browser")
    fail("BROWSER_REQUIRED", "Open this private generation in Guteneo.", 403);
  await workflow.getGeneration(ctx, id);
  if (recordId !== undefined) z.string().min(1).max(200).parse(recordId);
  if (cursor !== undefined) z.string().min(1).max(200).parse(cursor);
  limit = Number.isFinite(limit)
    ? Math.max(1, Math.min(50, Math.floor(limit)))
    : 50;
  const rows = await env.DB.prepare(
    "SELECT r.record_id,r.input_json,r.document_id FROM generation_records r JOIN generation_jobs j ON j.organization_id=r.organization_id AND j.id=r.job_id AND j.owner_id=? JOIN memberships m ON m.organization_id=j.organization_id AND m.user_id=j.owner_id AND m.role=? AND (m.role<>'supervisor' OR (m.supervisor_can_approve=? AND m.supervisor_can_report=?)) JOIN organizations o ON o.id=m.organization_id AND o.mode=? WHERE r.organization_id=? AND r.job_id=? AND (? IS NULL OR r.record_id=?) AND r.record_id>? ORDER BY r.record_id LIMIT ?",
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
    .all<{
      record_id: string;
      input_json: string;
      document_id: string | null;
    }>();
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
    return { context, data, documentId: row.document_id };
  });
  if (recordId !== undefined) {
    if (!contexts.length)
      fail("GENERATION_RECORD_NOT_FOUND", "Record not found.", 404);
    return {
      ...contexts[0].context,
      data: contexts[0].data,
      documentId: contexts[0].documentId,
    };
  }
  // Generation ownership does not retain access to current template metadata.
  const template = await env.DB.prepare(
    "SELECT t.name FROM generation_jobs j JOIN document_templates t ON t.organization_id=j.organization_id AND t.id=j.template_id AND t.deleted_at IS NULL LEFT JOIN template_permissions p ON p.organization_id=t.organization_id AND p.template_id=t.id AND p.user_id=j.owner_id JOIN memberships m ON m.organization_id=j.organization_id AND m.user_id=j.owner_id AND m.role=? AND (m.role<>'supervisor' OR (m.supervisor_can_approve=? AND m.supervisor_can_report=?)) JOIN organizations o ON o.id=m.organization_id AND o.mode=? WHERE j.organization_id=? AND j.id=? AND j.owner_id=? AND (t.owner_id=j.owner_id OR t.visibility='organization' OR (t.visibility<>'private' AND (p.can_use=1 OR (?=1 AND (p.can_edit=1 OR p.can_publish=1 OR p.can_share=1)))))",
  )
    .bind(
      ctx.role,
      Number(Boolean(ctx.supervisorCanApprove)),
      Number(Boolean(ctx.supervisorCanReport)),
      env.MODE,
      ctx.organizationId,
      id,
      ctx.userId,
      Number(workspacePermissions(ctx.role).prepareDispatches),
    )
    .first<{ name: string }>();
  return {
    items: contexts.map(({ context }) => context),
    nextCursor:
      rows.results.length > limit ? rows.results[limit - 1].record_id : null,
    templateName: template?.name ?? null,
  };
}
