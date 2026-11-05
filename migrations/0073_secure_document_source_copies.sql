-- Secure copies keep exact bytes but own an independent, creator-private identity.
ALTER TABLE documents ADD COLUMN secure_copy_source_id TEXT;
DROP INDEX documents_retained_hash;
DROP INDEX documents_private_retained_hash;
CREATE UNIQUE INDEX documents_retained_hash ON documents(organization_id,sha256) WHERE status<>'purged' AND access_owner_id IS NULL AND secure_copy_source_id IS NULL;
CREATE UNIQUE INDEX documents_private_retained_hash ON documents(organization_id,sha256,access_owner_id) WHERE status<>'purged' AND access_owner_id IS NOT NULL AND secure_copy_source_id IS NULL;
CREATE INDEX secure_copy_receipts ON audit_log(organization_id,resource_id) WHERE action='document.secure_copy_created';
CREATE TRIGGER immutable_secure_copy_source BEFORE UPDATE OF secure_copy_source_id ON documents WHEN NEW.secure_copy_source_id IS NOT OLD.secure_copy_source_id BEGIN SELECT RAISE(ABORT,'immutable_secure_copy_source'); END;
CREATE TRIGGER secure_copy_insert_guard BEFORE INSERT ON documents WHEN NEW.secure_copy_source_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'secure_copy_source_unavailable') WHERE NEW.status<>'ready' OR NEW.access_owner_id IS NULL OR NOT EXISTS(SELECT 1 FROM documents s WHERE s.organization_id=NEW.organization_id AND s.id=NEW.secure_copy_source_id AND s.status='ready' AND s.sha256=NEW.sha256 AND s.size=NEW.size AND s.pages=NEW.pages AND s.source=NEW.source AND s.storage_key<>NEW.storage_key AND s.secure_copy_source_id IS NULL AND (s.access_owner_id IS NULL OR s.access_owner_id=NEW.access_owner_id) AND NOT EXISTS(SELECT 1 FROM secure_distributions d WHERE d.organization_id=s.organization_id AND d.source_id=s.id) AND ((SELECT mode FROM organizations WHERE id=s.organization_id)='simulation' OR EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=s.organization_id AND a.action='document.scan_verified' AND a.resource_id=s.sha256)));
 SELECT RAISE(ABORT,'content_quota_exceeded') WHERE COALESCE((SELECT uploads FROM content_usage WHERE organization_id=NEW.organization_id AND day=substr(NEW.created_at,1,10)),0)+1>COALESCE((SELECT uploads_per_day FROM content_limits WHERE organization_id=NEW.organization_id),0) OR COALESCE((SELECT bytes FROM content_usage WHERE organization_id=NEW.organization_id AND day=substr(NEW.created_at,1,10)),0)+NEW.size>COALESCE((SELECT bytes_per_day FROM content_limits WHERE organization_id=NEW.organization_id),0);
 INSERT INTO content_usage(organization_id,day,uploads,bytes,renders) VALUES(NEW.organization_id,substr(NEW.created_at,1,10),1,NEW.size,0) ON CONFLICT(organization_id,day) DO UPDATE SET uploads=uploads+1,bytes=bytes+excluded.bytes;
END;

DROP TRIGGER legacy_hosting_sensitive_insert_guard;
CREATE TRIGGER legacy_hosting_sensitive_insert_guard BEFORE INSERT ON protected_document_hostings WHEN NEW.status IN ('draft','active')
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id) OR EXISTS(SELECT 1 FROM documents c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.document_id AND c.secure_copy_source_id IS NOT NULL);
END;

DROP TRIGGER legacy_hosting_sensitive_update_guard;
CREATE TRIGGER legacy_hosting_sensitive_update_guard BEFORE UPDATE ON protected_document_hostings WHEN NEW.status IN ('draft','active')
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id) OR EXISTS(SELECT 1 FROM documents c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.document_id AND c.secure_copy_source_id IS NOT NULL);
END;

DROP TRIGGER legacy_postal_sensitive_insert_guard;
CREATE TRIGGER legacy_postal_sensitive_insert_guard BEFORE INSERT ON postal_address_pages
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.source_document_id) OR EXISTS(SELECT 1 FROM documents c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.source_document_id AND c.secure_copy_source_id IS NOT NULL);
END;

DROP TRIGGER legacy_postal_sensitive_update_guard;
CREATE TRIGGER legacy_postal_sensitive_update_guard BEFORE UPDATE ON postal_address_pages
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.source_document_id) OR EXISTS(SELECT 1 FROM documents c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.source_document_id AND c.secure_copy_source_id IS NOT NULL);
END;

DROP TRIGGER legacy_preflight_sensitive_insert_guard;
CREATE TRIGGER legacy_preflight_sensitive_insert_guard BEFORE INSERT ON postal_preflights
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id) OR EXISTS(SELECT 1 FROM documents c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.document_id AND c.secure_copy_source_id IS NOT NULL);
END;

DROP TRIGGER legacy_provider_draft_sensitive_insert_guard;
CREATE TRIGGER legacy_provider_draft_sensitive_insert_guard BEFORE INSERT ON provider_drafts
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id) OR EXISTS(SELECT 1 FROM documents c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.document_id AND c.secure_copy_source_id IS NOT NULL);
END;

DROP TRIGGER legacy_dispatch_sensitive_insert_guard;
CREATE TRIGGER legacy_dispatch_sensitive_insert_guard BEFORE INSERT ON dispatches WHEN NEW.document_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id) OR EXISTS(SELECT 1 FROM documents c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.document_id AND c.secure_copy_source_id IS NOT NULL);
END;

DROP TRIGGER legacy_dispatch_sensitive_accept_guard;
CREATE TRIGGER legacy_dispatch_sensitive_accept_guard BEFORE UPDATE OF status ON dispatches WHEN NEW.document_id IS NOT NULL AND NEW.status IN ('queued','submitting')
BEGIN
 SELECT RAISE(ABORT,'sensitive_source_legacy_forbidden') WHERE EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=NEW.organization_id AND s.source_id=NEW.document_id) OR EXISTS(SELECT 1 FROM documents c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.document_id AND c.secure_copy_source_id IS NOT NULL);
END;
