-- Explicit, server-owned address-page derivations. No send or approval authority.
-- A one-hour retry window is shorter than the existing 24h R2 orphan grace period.
CREATE TABLE postal_address_pages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
  source_document_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  source_pages INTEGER NOT NULL CHECK(source_pages>0 AND source_pages<100),
  recipient_json TEXT NOT NULL CHECK(json_valid(recipient_json)),
  print_mode TEXT NOT NULL CHECK(print_mode IN ('simplex','duplex')),
  profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
  version TEXT NOT NULL,
  added_pages INTEGER NOT NULL CHECK((print_mode='duplex' AND added_pages=2) OR (print_mode='simplex' AND added_pages=1)),
  planned_document_id TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  generated_document_id TEXT,
  generated_sha256 TEXT CHECK(generated_sha256 IS NULL OR length(generated_sha256)=64),
  generated_size INTEGER CHECK(generated_size IS NULL OR generated_size BETWEEN 20 AND 8000000),
  lease_token TEXT NOT NULL,
  lease_until TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 3),
  expires_at TEXT NOT NULL,
  budget_day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(organization_id,id),
  UNIQUE(organization_id,idempotency_key),
  UNIQUE(organization_id,planned_document_id),
  FOREIGN KEY(organization_id,source_document_id) REFERENCES documents(organization_id,id),
  FOREIGN KEY(organization_id,generated_document_id) REFERENCES documents(organization_id,id),
  CHECK(source_pages+added_pages<=100),
  CHECK(generated_document_id IS NULL OR (generated_sha256 IS NOT NULL AND generated_size IS NOT NULL))
);
CREATE INDEX postal_address_pages_document ON postal_address_pages(organization_id,generated_document_id);
CREATE TRIGGER postal_address_page_insert_guard BEFORE INSERT ON postal_address_pages
BEGIN
  SELECT RAISE(ABORT,'postal_address_page_source_invalid') WHERE NOT EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.source_document_id AND d.sha256=NEW.source_sha256 AND d.pages=NEW.source_pages AND d.status='ready' AND EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=d.organization_id AND a.action='document.scan_verified' AND a.resource_id=d.sha256));
  SELECT RAISE(ABORT,'postal_address_page_recursive') WHERE EXISTS(SELECT 1 FROM postal_address_pages p WHERE p.organization_id=NEW.organization_id AND (p.generated_document_id=NEW.source_document_id OR p.planned_document_id=NEW.source_document_id));
  SELECT RAISE(ABORT,'postal_render_quota_exceeded') WHERE COALESCE((SELECT renders FROM content_usage WHERE organization_id=NEW.organization_id AND day=NEW.budget_day),0)+1>COALESCE((SELECT renders_per_day FROM content_limits WHERE organization_id=NEW.organization_id),0);
  SELECT RAISE(ABORT,'postal_address_page_initial_invalid') WHERE NEW.attempts<>1 OR NEW.generated_document_id IS NOT NULL OR NEW.generated_sha256 IS NOT NULL OR NEW.generated_size IS NOT NULL;
END;
CREATE TRIGGER postal_address_page_reserve_render AFTER INSERT ON postal_address_pages
BEGIN
  INSERT INTO content_usage(organization_id,day,uploads,bytes,renders) VALUES(NEW.organization_id,NEW.budget_day,0,0,1) ON CONFLICT(organization_id,day) DO UPDATE SET renders=renders+1;
END;
CREATE TRIGGER immutable_postal_address_page BEFORE UPDATE ON postal_address_pages
WHEN NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.user_id<>OLD.user_id OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.input_hash<>OLD.input_hash OR NEW.source_document_id<>OLD.source_document_id OR NEW.source_sha256<>OLD.source_sha256 OR NEW.source_pages<>OLD.source_pages OR NEW.recipient_json<>OLD.recipient_json OR NEW.print_mode<>OLD.print_mode OR NEW.profile_json<>OLD.profile_json OR NEW.version<>OLD.version OR NEW.added_pages<>OLD.added_pages OR NEW.planned_document_id<>OLD.planned_document_id OR NEW.artifact_key<>OLD.artifact_key OR NEW.expires_at<>OLD.expires_at OR NEW.budget_day<>OLD.budget_day OR NEW.created_at<>OLD.created_at OR (OLD.generated_document_id IS NOT NULL AND NEW.generated_document_id IS NOT OLD.generated_document_id) OR (OLD.generated_sha256 IS NOT NULL AND NEW.generated_sha256 IS NOT OLD.generated_sha256) OR (OLD.generated_size IS NOT NULL AND NEW.generated_size IS NOT OLD.generated_size) OR NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1
BEGIN
  SELECT RAISE(ABORT,'immutable_postal_address_page');
END;
CREATE TRIGGER postal_address_page_document_guard BEFORE UPDATE OF generated_document_id ON postal_address_pages
WHEN NEW.generated_document_id IS NOT NULL AND OLD.generated_document_id IS NULL
BEGIN
  SELECT RAISE(ABORT,'postal_address_page_document_invalid') WHERE NOT EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.generated_document_id AND d.id<>NEW.source_document_id AND d.sha256=NEW.generated_sha256 AND d.size=NEW.generated_size AND d.source='render' AND d.status IN ('ready','quarantined') AND (d.pages=0 OR d.pages=NEW.source_pages+NEW.added_pages));
  SELECT RAISE(ABORT,'postal_address_page_binding_conflict') WHERE EXISTS(SELECT 1 FROM postal_address_pages p WHERE p.organization_id=NEW.organization_id AND p.generated_document_id=NEW.generated_document_id AND (p.source_document_id<>NEW.source_document_id OR p.recipient_json<>NEW.recipient_json OR p.print_mode<>NEW.print_mode OR p.profile_json<>NEW.profile_json OR p.version<>NEW.version));
END;
-- Generated bytes cannot be used with a different printed address, pagination or profile.
-- This also fences the crash window between document registration and provenance completion.
CREATE TRIGGER postal_address_page_preflight_guard BEFORE INSERT ON postal_preflights
WHEN EXISTS(SELECT 1 FROM postal_address_pages p WHERE p.organization_id=NEW.organization_id AND (p.planned_document_id=NEW.document_id OR p.generated_document_id=NEW.document_id))
BEGIN
  SELECT RAISE(ABORT,'postal_address_page_binding_invalid') WHERE NOT EXISTS(SELECT 1 FROM postal_address_pages p WHERE p.organization_id=NEW.organization_id AND p.generated_document_id=NEW.document_id AND p.generated_sha256=NEW.document_sha256 AND p.recipient_json=NEW.recipient_json AND p.print_mode=json_extract(NEW.options_json,'$.printMode') AND p.profile_json=NEW.profile_json AND p.version='postal-address-page-2026-09-20-v1' AND EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=p.organization_id AND d.id=p.generated_document_id AND d.pages=p.source_pages+p.added_pages));
END;
