-- Private, reviewed account erasure. Existing request states remain the public contract.
CREATE TABLE account_deletion_plans (
 request_id TEXT PRIMARY KEY REFERENCES account_deletion_requests(id),
 plan_hash TEXT NOT NULL CHECK(length(plan_hash)=64),
 manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
 retentions_json TEXT NOT NULL CHECK(json_valid(retentions_json)),
 sealed_recipient TEXT NOT NULL,
 created_at TEXT NOT NULL,
 data_verified_at TEXT,
 lease_token TEXT,
 lease_expires_at TEXT
);
CREATE TABLE account_deletion_plan_checks (
 request_id TEXT NOT NULL REFERENCES account_deletion_plans(request_id),
 check_id INTEGER NOT NULL,
 matched INTEGER NOT NULL CHECK(matched=1),
 PRIMARY KEY(request_id,check_id)
);
CREATE TABLE account_deletion_steps (
 request_id TEXT NOT NULL REFERENCES account_deletion_plans(request_id),
 step TEXT NOT NULL CHECK(step IN ('objects','auth0','local','verification')),
 state TEXT NOT NULL CHECK(state IN ('pending','started','verified')),
 evidence_sha256 TEXT,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(request_id,step)
);
CREATE TABLE account_deletion_identity_tombstones (
 issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 request_id TEXT NOT NULL REFERENCES account_deletion_requests(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(issuer,subject)
);
CREATE TABLE account_deletion_notification_receipts (
 request_id TEXT PRIMARY KEY REFERENCES account_deletion_plans(request_id),
 provider TEXT NOT NULL CHECK(provider='resend'),
 provider_id TEXT NOT NULL UNIQUE,
 evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256)=64),
 verified_at TEXT NOT NULL
);
CREATE TRIGGER account_deletion_plan_immutable BEFORE UPDATE ON account_deletion_plans
WHEN NEW.request_id IS NOT OLD.request_id OR NEW.plan_hash IS NOT OLD.plan_hash OR NEW.manifest_json IS NOT OLD.manifest_json OR NEW.retentions_json IS NOT OLD.retentions_json OR NEW.created_at IS NOT OLD.created_at OR (NEW.sealed_recipient IS NOT OLD.sealed_recipient AND NEW.sealed_recipient<>'') OR (OLD.data_verified_at IS NOT NULL AND NEW.data_verified_at IS NOT OLD.data_verified_at)
BEGIN
 SELECT RAISE(ABORT,'account_deletion_plan_immutable');
END;
CREATE TRIGGER account_deletion_tombstone_immutable BEFORE UPDATE ON account_deletion_identity_tombstones
BEGIN
 SELECT RAISE(ABORT,'account_deletion_tombstone_immutable');
END;
CREATE TRIGGER account_deletion_tombstone_retained BEFORE DELETE ON account_deletion_identity_tombstones
BEGIN
 SELECT RAISE(ABORT,'account_deletion_tombstone_retained');
END;
CREATE TRIGGER account_deletion_notice_immutable BEFORE UPDATE ON account_deletion_notification_receipts
BEGIN
 SELECT RAISE(ABORT,'account_deletion_notice_immutable');
END;
CREATE TRIGGER account_deletion_notice_retained BEFORE DELETE ON account_deletion_notification_receipts
BEGIN
 SELECT RAISE(ABORT,'account_deletion_notice_retained');
END;
CREATE TRIGGER account_deletion_processing_guard BEFORE UPDATE OF status ON account_deletion_requests
WHEN NEW.status='processing' AND OLD.status='requested'
BEGIN
 SELECT RAISE(ABORT,'account_deletion_plan_required') WHERE NOT EXISTS(SELECT 1 FROM account_deletion_plans p WHERE p.request_id=NEW.id AND p.plan_hash=NEW.processing_reference);
END;
CREATE TRIGGER account_deletion_completion_guard BEFORE UPDATE OF status ON account_deletion_requests
WHEN NEW.status='completed'
BEGIN
 SELECT RAISE(ABORT,'account_deletion_incomplete') WHERE OLD.status NOT IN ('processing','completed') OR NOT EXISTS(SELECT 1 FROM account_deletion_plans p JOIN account_deletion_notification_receipts n ON n.request_id=p.request_id WHERE p.request_id=NEW.id AND p.plan_hash=NEW.processing_reference AND p.data_verified_at IS NOT NULL AND n.verified_at>=p.data_verified_at);
 SELECT RAISE(ABORT,'account_deletion_incomplete') WHERE (SELECT count(*) FROM account_deletion_steps WHERE request_id=NEW.id AND state='verified')<>4;
 SELECT RAISE(ABORT,'account_deletion_identity_remains') WHERE EXISTS(SELECT 1 FROM auth_identities WHERE user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM memberships WHERE user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM browser_sessions WHERE user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM personal_sessions WHERE user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM native_sessions WHERE user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM authorized_connections WHERE user_id=NEW.user_id) OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND name='Deleted account' AND email='deleted@account.invalid' AND preferred_locale IS NULL AND preferred_dashboard_appearance='v2');
END;
CREATE TRIGGER account_deletion_request_monotonic BEFORE UPDATE ON account_deletion_requests
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.created_at IS NOT OLD.created_at OR (OLD.status='processing' AND (NEW.status NOT IN ('processing','completed') OR NEW.processing_reference IS NOT OLD.processing_reference OR NEW.processing_at IS NOT OLD.processing_at)) OR (OLD.status='completed' AND (NEW.status IS NOT OLD.status OR NEW.completed_at IS NOT OLD.completed_at OR NEW.processing_reference IS NOT OLD.processing_reference))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_request_immutable');
END;
CREATE TRIGGER account_deletion_identity_insert BEFORE INSERT ON auth_identities
WHEN EXISTS(SELECT 1 FROM account_deletion_identity_tombstones WHERE issuer=NEW.issuer AND subject=NEW.subject) OR EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_identity_update BEFORE UPDATE ON auth_identities
WHEN EXISTS(SELECT 1 FROM account_deletion_identity_tombstones WHERE issuer=NEW.issuer AND subject=NEW.subject) OR EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_profile_guard BEFORE UPDATE ON users
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=OLD.id AND status IN ('processing','completed')) AND (NEW.name<>'Deleted account' OR NEW.email<>'deleted@account.invalid' OR NEW.preferred_locale IS NOT NULL OR NEW.preferred_dashboard_appearance<>'v2')
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_browser_sessions_insert BEFORE INSERT ON browser_sessions
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_browser_sessions_update BEFORE UPDATE ON browser_sessions
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_personal_sessions_insert BEFORE INSERT ON personal_sessions
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_personal_sessions_update BEFORE UPDATE ON personal_sessions
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_native_sessions_insert BEFORE INSERT ON native_sessions
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_native_sessions_update BEFORE UPDATE ON native_sessions
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_native_authorization_codes_insert BEFORE INSERT ON native_authorization_codes
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_native_authorization_codes_update BEFORE UPDATE ON native_authorization_codes
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_development_mcp_tokens_insert BEFORE INSERT ON development_mcp_tokens
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_development_mcp_tokens_update BEFORE UPDATE ON development_mcp_tokens
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_memberships_insert BEFORE INSERT ON memberships
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_memberships_update BEFORE UPDATE ON memberships
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_private_document_uploads_insert BEFORE INSERT ON private_document_uploads
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_private_document_uploads_update BEFORE UPDATE ON private_document_uploads
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_mcp_app_document_uploads_insert BEFORE INSERT ON mcp_app_document_uploads
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_mcp_app_document_uploads_update BEFORE UPDATE ON mcp_app_document_uploads
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_secure_deposit_operations_insert BEFORE INSERT ON secure_deposit_operations
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_secure_deposit_operations_update BEFORE UPDATE ON secure_deposit_operations
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_secure_personal_documents_insert BEFORE INSERT ON secure_personal_documents
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_secure_personal_documents_update BEFORE UPDATE ON secure_personal_documents
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_secure_distributions_insert BEFORE INSERT ON secure_distributions
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.created_by AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_secure_distributions_update BEFORE UPDATE ON secure_distributions
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.created_by AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_document_templates_insert BEFORE INSERT ON document_templates
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_document_templates_update BEFORE UPDATE ON document_templates
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_workflow_datasets_insert BEFORE INSERT ON workflow_datasets
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_workflow_datasets_update BEFORE UPDATE ON workflow_datasets
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_workflow_mappings_insert BEFORE INSERT ON workflow_mappings
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_workflow_mappings_update BEFORE UPDATE ON workflow_mappings
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_generation_jobs_insert BEFORE INSERT ON generation_jobs
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_generation_jobs_update BEFORE UPDATE ON generation_jobs
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_distribution_plans_insert BEFORE INSERT ON distribution_plans
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_distribution_plans_update BEFORE UPDATE ON distribution_plans
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_connection_insert BEFORE INSERT ON authorized_connections
WHEN NEW.status='active' AND EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_connection_update BEFORE UPDATE ON authorized_connections
WHEN NEW.status='active' AND EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_private_document_insert BEFORE INSERT ON documents
WHEN NEW.access_owner_id IS NOT NULL AND EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.access_owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_step_request_guard BEFORE INSERT ON account_deletion_steps
WHEN NOT EXISTS(SELECT 1 FROM account_deletion_requests r JOIN account_deletion_plans p ON p.request_id=r.id AND p.plan_hash=r.processing_reference WHERE r.id=NEW.request_id AND r.status='processing')
BEGIN
 SELECT RAISE(ABORT,'account_deletion_plan_changed');
END;
CREATE TRIGGER account_deletion_successor_guard BEFORE UPDATE OF status ON account_deletion_requests
WHEN NEW.status='processing' AND OLD.status='requested' AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=NEW.user_id AND m.role='admin' AND NOT EXISTS(SELECT 1 FROM memberships successor WHERE successor.organization_id=m.organization_id AND successor.user_id<>m.user_id AND successor.role='admin' AND NOT EXISTS(SELECT 1 FROM account_deletion_requests closing WHERE closing.user_id=successor.user_id AND closing.status IN('processing','completed'))))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_successor_required');
END;
CREATE TRIGGER account_deletion_recipient_binding_guard BEFORE UPDATE OF recipient_user_id,bound_at ON secure_distributions
WHEN NEW.recipient_user_id IS NOT NULL AND (NEW.recipient_user_id IS NOT OLD.recipient_user_id OR NEW.bound_at IS NOT OLD.bound_at) AND EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.recipient_user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_approvals_insert BEFORE INSERT ON approvals
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_approvals_update BEFORE UPDATE ON approvals
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_workspace_invitation_acceptances_insert BEFORE INSERT ON workspace_invitation_acceptances
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_workspace_invitation_acceptances_update BEFORE UPDATE ON workspace_invitation_acceptances
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_workflow_template_sources_insert BEFORE INSERT ON workflow_template_sources
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_workflow_template_sources_update BEFORE UPDATE ON workflow_template_sources
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.owner_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_pdf_validations_insert BEFORE INSERT ON pdf_validations
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.request_user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
CREATE TRIGGER account_deletion_pdf_validations_update BEFORE UPDATE ON pdf_validations
WHEN EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=NEW.request_user_id AND status IN ('processing','completed'))
BEGIN
 SELECT RAISE(ABORT,'account_deletion_in_progress');
END;
-- A retained membership of a closing account is not a live successor. Preserve
-- the last active administrator throughout the independently resumable erasure.
CREATE TRIGGER memberships_keep_last_active_admin_update BEFORE UPDATE OF role ON memberships
WHEN OLD.role='admin' AND NEW.role<>'admin' AND NOT EXISTS(SELECT 1 FROM memberships successor WHERE successor.organization_id=OLD.organization_id AND successor.user_id<>OLD.user_id AND successor.role='admin' AND NOT EXISTS(SELECT 1 FROM account_deletion_requests closing WHERE closing.user_id=successor.user_id AND closing.status IN('processing','completed')))
BEGIN
 SELECT RAISE(ABORT,'last_admin_required');
END;
CREATE TRIGGER memberships_keep_last_active_admin_delete BEFORE DELETE ON memberships
WHEN OLD.role='admin' AND NOT EXISTS(SELECT 1 FROM memberships successor WHERE successor.organization_id=OLD.organization_id AND successor.user_id<>OLD.user_id AND successor.role='admin' AND NOT EXISTS(SELECT 1 FROM account_deletion_requests closing WHERE closing.user_id=successor.user_id AND closing.status IN('processing','completed')))
BEGIN
 SELECT RAISE(ABORT,'last_admin_required');
END;
