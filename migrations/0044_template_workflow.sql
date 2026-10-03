-- Additive document studio. No provider, credit, approval or outbox changes.
CREATE TABLE document_templates (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), owner_id TEXT NOT NULL REFERENCES users(id),
 name TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('draft','published','archived')), visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','organization','selected')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), current_version INTEGER, draft_json TEXT NOT NULL CHECK(json_valid(draft_json)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(organization_id,id)
);
CREATE INDEX document_templates_page ON document_templates(organization_id,created_at DESC,id DESC);
CREATE TABLE template_permissions (
 organization_id TEXT NOT NULL, template_id TEXT NOT NULL, user_id TEXT NOT NULL,
 can_use INTEGER NOT NULL DEFAULT 0 CHECK(can_use IN (0,1)), can_edit INTEGER NOT NULL DEFAULT 0 CHECK(can_edit IN (0,1)), can_publish INTEGER NOT NULL DEFAULT 0 CHECK(can_publish IN (0,1)), can_share INTEGER NOT NULL DEFAULT 0 CHECK(can_share IN (0,1)),
 PRIMARY KEY(organization_id,template_id,user_id), FOREIGN KEY(organization_id,template_id) REFERENCES document_templates(organization_id,id), FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id) ON DELETE CASCADE
);
CREATE TABLE template_versions (
 organization_id TEXT NOT NULL, template_id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), envelope_json TEXT NOT NULL CHECK(json_valid(envelope_json)), sha256 TEXT NOT NULL, published_by TEXT NOT NULL REFERENCES users(id), published_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,template_id,version), FOREIGN KEY(organization_id,template_id) REFERENCES document_templates(organization_id,id)
);
CREATE TRIGGER immutable_template_version BEFORE UPDATE ON template_versions BEGIN SELECT RAISE(ABORT,'immutable_template_version'); END;
CREATE TABLE workflow_datasets (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, format TEXT NOT NULL CHECK(format IN ('csv','xlsx','json','xml')), sha256 TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0), storage_key TEXT NOT NULL, profile_key TEXT, structure_hash TEXT,
 status TEXT NOT NULL CHECK(status IN ('quarantined','ready','rejected','purged')), error_code TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, UNIQUE(organization_id,id)
);
CREATE INDEX workflow_datasets_page ON workflow_datasets(organization_id,owner_id,created_at DESC,id DESC);
CREATE TRIGGER immutable_dataset_source BEFORE UPDATE ON workflow_datasets WHEN NEW.organization_id<>OLD.organization_id OR NEW.owner_id<>OLD.owner_id OR NEW.sha256<>OLD.sha256 OR NEW.storage_key<>OLD.storage_key OR NEW.size<>OLD.size OR NEW.format<>OLD.format BEGIN SELECT RAISE(ABORT,'immutable_dataset_source'); END;
CREATE TABLE workflow_template_sources (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), template_id TEXT NOT NULL, format TEXT NOT NULL CHECK(format='docx'), sha256 TEXT NOT NULL, storage_key TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, purged INTEGER NOT NULL DEFAULT 0 CHECK(purged IN (0,1)),
 FOREIGN KEY(organization_id,template_id) REFERENCES document_templates(organization_id,id)
);
CREATE TABLE workflow_mappings (
 id TEXT NOT NULL, organization_id TEXT NOT NULL REFERENCES organizations(id), owner_id TEXT NOT NULL REFERENCES users(id), version INTEGER NOT NULL CHECK(version>0), name TEXT NOT NULL, source_dataset_id TEXT NOT NULL, structure_hash TEXT NOT NULL, plan_json TEXT NOT NULL CHECK(json_valid(plan_json)), validation_json TEXT CHECK(validation_json IS NULL OR json_valid(validation_json)), state TEXT NOT NULL CHECK(state IN ('draft','validated')), created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,id,version), FOREIGN KEY(organization_id,source_dataset_id) REFERENCES workflow_datasets(organization_id,id)
);
CREATE TRIGGER immutable_mapping BEFORE UPDATE ON workflow_mappings WHEN NEW.organization_id<>OLD.organization_id OR NEW.id<>OLD.id OR NEW.version<>OLD.version OR NEW.owner_id<>OLD.owner_id OR NEW.plan_json<>OLD.plan_json OR NEW.structure_hash<>OLD.structure_hash OR NEW.source_dataset_id<>OLD.source_dataset_id OR OLD.state='validated' BEGIN SELECT RAISE(ABORT,'immutable_mapping'); END;
CREATE TABLE generation_jobs (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), owner_id TEXT NOT NULL REFERENCES users(id), request_role TEXT NOT NULL, request_actor TEXT NOT NULL, authority_json TEXT CHECK(authority_json IS NULL OR json_valid(authority_json)), template_id TEXT NOT NULL, template_version INTEGER NOT NULL, mapping_id TEXT, mapping_version INTEGER, dataset_id TEXT,
 mode TEXT NOT NULL DEFAULT 'generate_only' CHECK(mode='generate_only'), state TEXT NOT NULL CHECK(state IN ('queued','running','completed','partial','failed','cancelled')), total INTEGER NOT NULL CHECK(total BETWEEN 1 AND 500), idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(organization_id,id), UNIQUE(organization_id,idempotency_key), FOREIGN KEY(organization_id,template_id,template_version) REFERENCES template_versions(organization_id,template_id,version), FOREIGN KEY(organization_id,mapping_id,mapping_version) REFERENCES workflow_mappings(organization_id,id,version), FOREIGN KEY(organization_id,dataset_id) REFERENCES workflow_datasets(organization_id,id)
);
CREATE INDEX generation_jobs_pending ON generation_jobs(state,created_at,id);
CREATE TRIGGER immutable_generation_job BEFORE UPDATE ON generation_jobs WHEN NEW.organization_id<>OLD.organization_id OR NEW.owner_id<>OLD.owner_id OR NEW.template_id<>OLD.template_id OR NEW.template_version<>OLD.template_version OR NEW.dataset_id IS NOT OLD.dataset_id OR NEW.mapping_id IS NOT OLD.mapping_id OR NEW.mapping_version IS NOT OLD.mapping_version OR NEW.request_hash<>OLD.request_hash OR NEW.authority_json IS NOT OLD.authority_json OR NEW.request_role<>OLD.request_role OR NEW.request_actor<>OLD.request_actor OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.total<>OLD.total BEGIN SELECT RAISE(ABORT,'immutable_generation_job'); END;
CREATE TABLE generation_records (
 organization_id TEXT NOT NULL, job_id TEXT NOT NULL, record_id TEXT NOT NULL, ordinal INTEGER NOT NULL, input_json TEXT NOT NULL CHECK(json_valid(input_json)), input_hash TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('queued','running','generated','failed','cancelled')), attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), lease_token TEXT, lease_until TEXT, artifact_key TEXT, artifact_hash TEXT, document_id TEXT, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,job_id,record_id), UNIQUE(organization_id,job_id,ordinal), FOREIGN KEY(organization_id,job_id) REFERENCES generation_jobs(organization_id,id), FOREIGN KEY(organization_id,document_id) REFERENCES documents(organization_id,id)
);
CREATE TRIGGER immutable_generation_input BEFORE UPDATE ON generation_records WHEN NEW.organization_id<>OLD.organization_id OR NEW.job_id<>OLD.job_id OR NEW.record_id<>OLD.record_id OR NEW.input_json<>OLD.input_json OR NEW.input_hash<>OLD.input_hash OR (OLD.artifact_key IS NOT NULL AND NEW.artifact_key IS NOT OLD.artifact_key) OR (OLD.artifact_hash IS NOT NULL AND NEW.artifact_hash IS NOT OLD.artifact_hash) OR (OLD.document_id IS NOT NULL AND NEW.document_id IS NOT OLD.document_id) BEGIN SELECT RAISE(ABORT,'immutable_generation_input'); END;
CREATE TABLE distribution_plans (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), owner_id TEXT NOT NULL REFERENCES users(id), job_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, manifest_hash TEXT NOT NULL, manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)), created_at TEXT NOT NULL,
 UNIQUE(organization_id,id), UNIQUE(organization_id,idempotency_key), FOREIGN KEY(organization_id,job_id) REFERENCES generation_jobs(organization_id,id)
);
CREATE TRIGGER immutable_distribution_plan BEFORE UPDATE ON distribution_plans BEGIN SELECT RAISE(ABORT,'immutable_distribution_plan'); END;
CREATE TABLE distribution_entries (
 organization_id TEXT NOT NULL, plan_id TEXT NOT NULL, entry_id TEXT NOT NULL, dispatch_id TEXT, error_code TEXT,
 PRIMARY KEY(organization_id,plan_id,entry_id), FOREIGN KEY(organization_id,plan_id) REFERENCES distribution_plans(organization_id,id), FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id)
);
CREATE TRIGGER distribution_entry_binding BEFORE UPDATE OF dispatch_id ON distribution_entries WHEN NEW.dispatch_id IS NOT NULL BEGIN
 SELECT CASE WHEN OLD.dispatch_id IS NOT NULL AND NEW.dispatch_id<>OLD.dispatch_id THEN RAISE(ABORT,'immutable_distribution_dispatch') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM distribution_plans p,json_each(p.manifest_json) e JOIN dispatches d ON d.organization_id=p.organization_id AND d.id=NEW.dispatch_id JOIN documents doc ON doc.organization_id=d.organization_id AND doc.id=d.document_id WHERE p.organization_id=NEW.organization_id AND p.id=NEW.plan_id AND json_extract(e.value,'$.entryId')=NEW.entry_id AND json_extract(e.value,'$.documentId')=d.document_id AND json_extract(e.value,'$.documentHash')=doc.sha256 AND json_extract(e.value,'$.channel')=d.channel AND json_extract(e.value,'$.recipient')=json(d.recipient_json)) THEN RAISE(ABORT,'distribution_binding_mismatch') END;
END;
CREATE TABLE workflow_ai_policy (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), transfer_approved INTEGER NOT NULL DEFAULT 0 CHECK(transfer_approved IN (0,1)), daily_limit INTEGER NOT NULL DEFAULT 10 CHECK(daily_limit BETWEEN 0 AND 100), updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL
);
CREATE TABLE workflow_ai_usage (
 organization_id TEXT NOT NULL REFERENCES organizations(id), day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0 CHECK(calls>=0), PRIMARY KEY(organization_id,day)
);
