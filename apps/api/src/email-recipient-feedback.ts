import { z } from "zod";
import { sha256 } from "../../../packages/domain/src/index";

const inputSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.enum(["unsubscribe", "report"]),
  })
  .strict();
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
/** A mailbox capability can reduce only the originating workspace's email rights. */
export async function handleEmailRecipientFeedback(
  request: Request,
  env: { DB: D1Database; APP_ORIGIN: string },
): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/api/email-preferences") return null;
  const fail = (status: number, code: string) =>
    Response.json(
      {
        error: {
          code,
          message: "This email preference request is unavailable.",
        },
      },
      { status, headers },
    );
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
  if (request.headers.get("Origin") !== new URL(env.APP_ORIGIN).origin)
    return fail(403, "ORIGIN_REJECTED");
  if (Number(request.headers.get("Content-Length") ?? 0) > 1024)
    return fail(413, "PAYLOAD_TOO_LARGE");
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let body = "",
    size = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1024) {
          await reader.cancel();
          return fail(413, "PAYLOAD_TOO_LARGE");
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
    body += decoder.decode();
  }
  let input;
  try {
    input = inputSchema.parse(JSON.parse(body));
  } catch {
    return fail(400, "INVALID_EMAIL_PREFERENCE");
  }
  const tokenHash = await sha256(input.token);
  const source = await env.DB.prepare(
    `SELECT d.organization_id,d.id,json_extract(d.recipient_json,'$.email') email
    FROM email_recipient_feedback_tokens t JOIN dispatches d ON d.organization_id=t.organization_id AND d.id=t.dispatch_id
    WHERE t.token_hash=? AND d.channel='email' AND d.status NOT IN ('prepared','cancelled')`,
  )
    .bind(tokenHash)
    .first<{ organization_id: string; id: string; email: string }>();
  if (!source) return fail(404, "EMAIL_PREFERENCE_UNAVAILABLE");
  const feedback = input.action === "report" ? "reported" : "unsubscribed";
  const reason = input.action === "report" ? "complaint" : "unsubscribe";
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO suppressions(organization_id,email,reason,created_at) VALUES(?,?,?,?)
      ON CONFLICT(organization_id,email) DO UPDATE SET reason=CASE WHEN suppressions.reason='complaint' THEN 'complaint' ELSE excluded.reason END`,
    ).bind(source.organization_id, source.email, reason, now),
    env.DB.prepare(
      "UPDATE dispatches SET recipient_feedback=CASE WHEN recipient_feedback='reported' THEN 'reported' ELSE ? END,updated_at=? WHERE organization_id=? AND id=?",
    ).bind(feedback, now, source.organization_id, source.id),
    env.DB.prepare(
      `INSERT OR IGNORE INTO secure_document_events(id,organization_id,distribution_id,type,provenance,created_at)
      SELECT ?,organization_id,id,?,'server',? FROM secure_distributions WHERE organization_id=? AND dispatch_id=?`,
    ).bind(
      `email_feedback_${source.id}_${feedback}`,
      `recipient_email_${feedback}`,
      now,
      source.organization_id,
      source.id,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at)
      VALUES(?,?,NULL,?,?,'{"source":"recipient_email_link"}',?)`,
    ).bind(
      `email_feedback_${source.id}_${feedback}`,
      source.organization_id,
      `recipient.email_${feedback}`,
      source.id,
      now,
    ),
  ]);
  const current = await env.DB.prepare(
    "SELECT recipient_feedback feedback FROM dispatches WHERE organization_id=? AND id=?",
  )
    .bind(source.organization_id, source.id)
    .first<{ feedback: string }>();
  return Response.json(
    { feedback: current?.feedback ?? feedback, scope: "workspace" },
    { headers },
  );
}
