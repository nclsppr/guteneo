import type { Env } from "./env";
/** Bounded and restartable. Missing content never authorizes retransmission. */
export async function maintainDocuments(
  env: Env,
): Promise<{ purged: number; orphans: number }> {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  let purged = 0,
    orphans = 0;
  const purgeState = await env.DB.prepare(
    "SELECT value FROM maintenance_state WHERE key='document_purge_cursor'",
  ).first<{ value: string }>();
  const after = purgeState?.value
    ? (JSON.parse(purgeState.value) as { created_at: string; id: string })
    : { created_at: "", id: "" };
  const rows = await env.DB.prepare(
    `SELECT id,organization_id,storage_key,created_at FROM documents WHERE (status='purged' OR created_at<?) AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT 25`,
  )
    .bind(cutoff, after.created_at, after.created_at, after.id)
    .all<{
      id: string;
      organization_id: string;
      storage_key: string;
      created_at: string;
    }>();
  for (const doc of rows.results) {
    const result = await env.DB.prepare(
      `UPDATE documents SET status='purged',name='Document supprimé' WHERE id=? AND (status='purged' OR created_at<?) AND NOT EXISTS(SELECT 1 FROM dispatches WHERE document_id=? AND status NOT IN ('delivered','failed','cancelled','bounced','complained','handed_to_post')) AND NOT EXISTS(SELECT 1 FROM protected_document_hostings h WHERE h.organization_id=documents.organization_id AND h.document_id=documents.id AND h.status='active' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) RETURNING id`,
    )
      .bind(doc.id, cutoff, doc.id)
      .first();
    if (!result) continue;
    await env.DOCUMENTS.delete(doc.storage_key);
    // Idempotent audit ID for automatic purge, no content retained.
    await env.DB.prepare(
      "INSERT OR IGNORE INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,NULL,?,?,?,?)",
    )
      .bind(
        `purge_${doc.id}`,
        doc.organization_id,
        "document.purged",
        doc.id,
        "{}",
        new Date().toISOString(),
      )
      .run();
    purged++;
  }
  const last = rows.results.at(-1);
  await env.DB.prepare(
    "INSERT INTO maintenance_state(key,value) VALUES('document_purge_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  )
    .bind(
      last ? JSON.stringify({ created_at: last.created_at, id: last.id }) : "",
    )
    .run();
  const state = await env.DB.prepare(
    "SELECT value FROM maintenance_state WHERE key='r2_orphan_cursor'",
  ).first<{ value: string }>();
  const listing = await env.DOCUMENTS.list({
    limit: 50,
    cursor: state?.value || undefined,
  });
  for (const object of listing.objects) {
    if (object.uploaded.getTime() > Date.now() - 86400000) continue;
    const record = await env.DB.prepare(
      "SELECT 1 FROM documents WHERE storage_key=? UNION ALL SELECT 1 FROM workflow_datasets WHERE status<>'purged' AND (storage_key=? OR profile_key=?) UNION ALL SELECT 1 FROM workflow_template_sources WHERE purged=0 AND storage_key=? UNION ALL SELECT 1 FROM generation_records WHERE artifact_key=? LIMIT 1",
    )
      .bind(object.key, object.key, object.key, object.key, object.key)
      .first();
    if (!record) {
      await env.DOCUMENTS.delete(object.key);
      orphans++;
    }
  }
  await env.DB.prepare(
    "INSERT INTO maintenance_state(key,value) VALUES('r2_orphan_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  )
    .bind(listing.truncated ? listing.cursor : "")
    .run();
  await env.DB.prepare("DELETE FROM content_usage WHERE day<?")
    .bind(new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10))
    .run();
  const expiredSources = await env.DB.prepare(
    "SELECT id,organization_id,storage_key,profile_key FROM workflow_datasets WHERE status<>'purged' AND expires_at<? AND NOT EXISTS(SELECT 1 FROM generation_jobs j WHERE j.organization_id=workflow_datasets.organization_id AND j.dataset_id=workflow_datasets.id AND j.state IN ('queued','running')) LIMIT 25",
  )
    .bind(new Date().toISOString())
    .all<{
      id: string;
      organization_id: string;
      storage_key: string;
      profile_key: string | null;
    }>();
  for (const source of expiredSources.results) {
    await env.DOCUMENTS.delete([
      source.storage_key,
      ...(source.profile_key ? [source.profile_key] : []),
    ]);
    await env.DB.prepare(
      "UPDATE workflow_datasets SET status='purged',error_code='SOURCE_EXPIRED',profile_key=NULL WHERE organization_id=? AND id=?",
    )
      .bind(source.organization_id, source.id)
      .run();
  }
  const expiredWord = await env.DB.prepare(
    "SELECT id,storage_key FROM workflow_template_sources WHERE purged=0 AND expires_at<? LIMIT 25",
  )
    .bind(new Date().toISOString())
    .all<{ id: string; storage_key: string }>();
  for (const source of expiredWord.results) {
    await env.DOCUMENTS.delete(source.storage_key);
    await env.DB.prepare(
      "UPDATE workflow_template_sources SET purged=1 WHERE id=?",
    )
      .bind(source.id)
      .run();
  }
  const expiredGenerationData = await env.DB.prepare(
    "SELECT r.organization_id,r.job_id,r.record_id,r.artifact_key FROM generation_records r JOIN generation_jobs j ON j.organization_id=r.organization_id AND j.id=r.job_id WHERE r.data_purged_at IS NULL AND r.created_at<? AND j.state NOT IN ('queued','running') LIMIT 25",
  )
    .bind(cutoff)
    .all<{
      organization_id: string;
      job_id: string;
      record_id: string;
      artifact_key: string | null;
    }>();
  for (const record of expiredGenerationData.results) {
    if (record.artifact_key) await env.DOCUMENTS.delete(record.artifact_key);
    await env.DB.prepare(
      "UPDATE generation_records SET input_json='{}',artifact_key=NULL,data_purged_at=? WHERE organization_id=? AND job_id=? AND record_id=? AND data_purged_at IS NULL",
    )
      .bind(
        new Date().toISOString(),
        record.organization_id,
        record.job_id,
        record.record_id,
      )
      .run();
  }
  for (const table of [
    "auth_transactions",
    "native_authorization_codes",
    "native_sessions",
    "browser_sessions",
    "development_mcp_tokens",
  ])
    await env.DB.prepare(`DELETE FROM ${table} WHERE expires_at<?`)
      .bind(new Date().toISOString())
      .run();
  await env.DB.prepare(
    "DELETE FROM auth_flow_limits WHERE key IN (SELECT key FROM auth_flow_limits WHERE window_start<? LIMIT 500)",
  )
    .bind(Math.floor(Date.now() / 3_600_000) - 48)
    .run();
  await env.DB.prepare(
    "DELETE FROM document_access_grants WHERE token_hash IN (SELECT token_hash FROM document_access_grants WHERE expires_at<? ORDER BY expires_at LIMIT 100)",
  )
    .bind(new Date().toISOString())
    .run();
  return { purged, orphans };
}
