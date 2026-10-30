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
    `SELECT d.id,d.organization_id,d.storage_key,d.created_at,
    CASE WHEN d.status='purged' AND a.id IS NOT NULL THEN 1 ELSE 0 END purge_complete
    FROM (SELECT id,organization_id,storage_key,created_at,status FROM documents
      WHERE (status='purged' OR created_at<?) AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT 25) d
    LEFT JOIN audit_log a ON a.id='purge_'||d.id AND a.organization_id=d.organization_id AND a.action='document.purged' AND a.resource_id=d.id
    ORDER BY d.created_at,d.id`,
  )
    .bind(cutoff, after.created_at, after.created_at, after.id)
    .all<{
      id: string;
      organization_id: string;
      storage_key: string;
      created_at: string;
      purge_complete: number;
    }>();
  for (const doc of rows.results) {
    // The audit is written only after R2 deletion succeeds. Keep completed rows
    // in the bounded cursor page, but do not delete or count them again when it
    // wraps. A tombstone without this tenant-scoped completion proof must retry.
    if (doc.purge_complete) continue;
    const result = await env.DB.prepare(
      `UPDATE documents SET status='purged',name='Deleted document' WHERE organization_id=? AND id=? AND (status='purged' OR created_at<?) AND NOT EXISTS(SELECT 1 FROM dispatches WHERE organization_id=documents.organization_id AND document_id=documents.id AND status NOT IN ('delivered','failed','cancelled','bounced','complained','handed_to_post')) AND NOT EXISTS(SELECT 1 FROM protected_document_hostings h WHERE h.organization_id=documents.organization_id AND h.document_id=documents.id AND h.status='active' AND h.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) RETURNING id`,
    )
      .bind(doc.organization_id, doc.id, cutoff)
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
      `SELECT 1 WHERE EXISTS(SELECT 1 FROM documents WHERE storage_key=?) OR EXISTS(SELECT 1 FROM workflow_datasets WHERE status<>'purged' AND (storage_key=? OR profile_key=?)) OR EXISTS(SELECT 1 FROM workflow_template_sources WHERE purged=0 AND storage_key=?) OR EXISTS(SELECT 1 FROM generation_records WHERE artifact_key=?)
      OR EXISTS(SELECT 1 FROM secure_distributions WHERE original_key=? AND NOT EXISTS(SELECT 1 FROM secure_object_purges p WHERE p.scope='shared' AND p.resource_id=secure_distributions.id))
      OR EXISTS(SELECT 1 FROM secure_distribution_pages WHERE (image_key=? OR text_key=?) AND NOT EXISTS(SELECT 1 FROM secure_object_purges p WHERE p.scope='shared' AND p.resource_id=secure_distribution_pages.distribution_id))
      OR EXISTS(SELECT 1 FROM secure_personal_documents WHERE original_key=? AND NOT EXISTS(SELECT 1 FROM secure_object_purges p WHERE p.scope='personal' AND p.resource_id=secure_personal_documents.id))
      OR EXISTS(SELECT 1 FROM secure_personal_pages WHERE (image_key=? OR text_key=?) AND NOT EXISTS(SELECT 1 FROM secure_object_purges p WHERE p.scope='personal' AND p.resource_id=secure_personal_pages.personal_document_id))
      OR EXISTS(SELECT 1 FROM secure_deposit_operations op JOIN secure_distributions s ON s.organization_id=op.organization_id AND s.id=op.distribution_id WHERE op.status='preparing' AND s.status='active' AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND instr(?, 'secure/personal/'||op.user_id||'/'||op.personal_document_id||'/')=1)`,
    )
      .bind(...Array.from({length:12},()=>object.key))
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
    "personal_sessions",
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
  await maintainSecureObjects(env);
  return { purged, orphans };
}

/** Object erasure is bounded and restartable. Independent personal namespaces
 * are never traversed from workshop revocation or source purging. */
export async function maintainSecureObjects(env:Env) {
  const time=new Date().toISOString();
  const shared=await env.DB.prepare(`SELECT id,organization_id,original_key FROM secure_distributions s WHERE ((activated_at IS NOT NULL AND expires_at<=?) OR (activated_at IS NULL AND prepared_expires_at<=?)) AND NOT EXISTS(SELECT 1 FROM secure_object_purges p WHERE p.scope='shared' AND p.resource_id=s.id) ORDER BY created_at LIMIT 5`).bind(time,time).all<{id:string;organization_id:string;original_key:string|null}>();
  for(const row of shared.results){
    const pages=await env.DB.prepare("SELECT image_key,text_key FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=?").bind(row.organization_id,row.id).all<{image_key:string;text_key:string}>();
    const keys=[...(row.original_key?[row.original_key]:[]),...pages.results.flatMap((page)=>[page.image_key,page.text_key])];
    if(keys.length)await env.DOCUMENTS.delete(keys);
    await env.DB.prepare("INSERT OR IGNORE INTO secure_object_purges(scope,resource_id,completed_at) VALUES('shared',?,?)").bind(row.id,time).run();
  }
  const personal=await env.DB.prepare(`SELECT id,user_id,original_key FROM secure_personal_documents d WHERE (status<>'active' OR expires_at<=?) AND NOT EXISTS(SELECT 1 FROM secure_object_purges p WHERE p.scope='personal' AND p.resource_id=d.id) ORDER BY created_at LIMIT 5`).bind(time).all<{id:string;user_id:string;original_key:string}>();
  for(const row of personal.results){
    const pages=await env.DB.prepare("SELECT image_key,text_key FROM secure_personal_pages WHERE user_id=? AND personal_document_id=?").bind(row.user_id,row.id).all<{image_key:string;text_key:string}>();
    await env.DOCUMENTS.delete([row.original_key,...pages.results.flatMap((page)=>[page.image_key,page.text_key])]);
    await env.DB.batch([env.DB.prepare("UPDATE secure_personal_documents SET status='expired' WHERE user_id=? AND id=? AND status='active' AND expires_at<=?").bind(row.user_id,row.id,time),env.DB.prepare("INSERT OR IGNORE INTO secure_object_purges(scope,resource_id,completed_at) VALUES('personal',?,?)").bind(row.id,time)]);
  }
  // Unpublished copy objects have deterministic keys and can be erased without
  // depending on a partially completed R2 listing cursor.
  const abandoned=await env.DB.prepare(`SELECT op.id,op.user_id,op.personal_document_id,s.source_pages FROM secure_deposit_operations op JOIN secure_distributions s ON s.organization_id=op.organization_id AND s.id=op.distribution_id WHERE op.status='aborted' AND NOT EXISTS(SELECT 1 FROM secure_object_purges p WHERE p.scope='deposit' AND p.resource_id=op.id) LIMIT 5`).all<{id:string;user_id:string;personal_document_id:string;source_pages:number}>();
  for(const row of abandoned.results){const prefix=`secure/personal/${row.user_id}/${row.personal_document_id}`;await env.DOCUMENTS.delete([`${prefix}/original.bin`,...Array.from({length:row.source_pages},(_,index)=>[`${prefix}/${index+1}.image`,`${prefix}/${index+1}.text`]).flat()]);await env.DB.prepare("INSERT OR IGNORE INTO secure_object_purges(scope,resource_id,completed_at) VALUES('deposit',?,?)").bind(row.id,time).run();}
  await env.DB.prepare("DELETE FROM secure_document_rate_limits WHERE rowid IN (SELECT rowid FROM secure_document_rate_limits WHERE window<? LIMIT 500)").bind(Math.floor(Date.now()/60000)-5).run();
  // Activity detail has its own rolling retention; approval and charge evidence
  // is separate. New content is never returned without a fresh durable event.
  await env.DB.prepare(`DELETE FROM secure_document_events WHERE id IN (SELECT id FROM secure_document_events WHERE created_at<? AND type IN ('page_access_authorized','page_displayed','accessible_text_access_authorized','original_download_requested','original_transfer_started','workshop_page_access_authorized','workshop_accessible_text_access_authorized') ORDER BY created_at LIMIT 1000)`)
    .bind(new Date(Date.now()-90*86400000).toISOString()).run();
}
