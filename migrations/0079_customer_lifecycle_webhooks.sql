-- Optional metadata callbacks. No endpoint, secret or external request is activated by migration.
CREATE TABLE customer_webhook_endpoints (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80), url TEXT NOT NULL CHECK(length(url) BETWEEN 1 AND 2048),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)), status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','revoked')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1), secret_ciphertext TEXT,
 request_key TEXT NOT NULL, request_hash TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, overflow_count INTEGER NOT NULL DEFAULT 0 CHECK(overflow_count>=0),
 UNIQUE(organization_id,id), UNIQUE(organization_id,request_key),
 CHECK((status='active' AND secret_ciphertext IS NOT NULL) OR (status='revoked' AND enabled=0 AND secret_ciphertext IS NULL))
);
CREATE TABLE customer_webhook_deliveries (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), endpoint_id TEXT NOT NULL, endpoint_revision INTEGER NOT NULL,
 event_id TEXT NOT NULL, dispatch_id TEXT NOT NULL, dispatch_status TEXT NOT NULL CHECK(dispatch_status IN('prepared','queued','submitting','submission_unknown','accepted','delivered','failed','cancelled','bounced','complained','printed','handed_to_post')),
 channel TEXT NOT NULL CHECK(channel IN('fax','email','postal')), occurred_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','failed','unknown','superseded')),
 lease_token TEXT, lease_until TEXT, invoked_at TEXT, finished_at TEXT, response_status INTEGER CHECK(response_status BETWEEN 100 AND 599), error_code TEXT,
 UNIQUE(organization_id,id), UNIQUE(organization_id,endpoint_id,endpoint_revision,event_id),
 FOREIGN KEY(organization_id,endpoint_id) REFERENCES customer_webhook_endpoints(organization_id,id),
 FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id)
);
CREATE INDEX customer_webhook_pending ON customer_webhook_deliveries(status,occurred_at,id);
CREATE INDEX customer_webhook_endpoint_history ON customer_webhook_deliveries(organization_id,endpoint_id,id);
CREATE INDEX customer_webhook_endpoint_time ON customer_webhook_deliveries(organization_id,endpoint_id,occurred_at DESC,id DESC);
CREATE INDEX customer_webhook_endpoint_pending ON customer_webhook_deliveries(organization_id,endpoint_id,status);
CREATE INDEX customer_webhook_source_event ON customer_webhook_deliveries(organization_id,endpoint_id,event_id);
CREATE TRIGGER customer_webhook_endpoint_identity BEFORE UPDATE ON customer_webhook_endpoints
WHEN NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at OR NEW.request_key IS NOT OLD.request_key OR NEW.request_hash IS NOT OLD.request_hash OR (OLD.status='revoked' AND (NEW.status<>'revoked' OR NEW.enabled<>0 OR NEW.secret_ciphertext IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'customer_webhook_identity_immutable'); END;
CREATE TRIGGER customer_webhook_revision_guard BEFORE UPDATE ON customer_webhook_endpoints
WHEN (NEW.name IS NOT OLD.name OR NEW.url IS NOT OLD.url OR NEW.enabled IS NOT OLD.enabled OR NEW.status IS NOT OLD.status OR NEW.secret_ciphertext IS NOT OLD.secret_ciphertext) AND NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'customer_webhook_revision_required'); END;
CREATE TRIGGER customer_webhook_supersede AFTER UPDATE OF revision ON customer_webhook_endpoints WHEN NEW.revision<>OLD.revision
BEGIN UPDATE customer_webhook_deliveries SET status='superseded',finished_at=NEW.updated_at,error_code='endpoint_revision_changed' WHERE organization_id=NEW.organization_id AND endpoint_id=NEW.id AND status='pending'; END;
CREATE TRIGGER customer_webhook_delivery_identity BEFORE UPDATE ON customer_webhook_deliveries
WHEN NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.endpoint_id IS NOT OLD.endpoint_id OR NEW.endpoint_revision IS NOT OLD.endpoint_revision OR NEW.event_id IS NOT OLD.event_id OR NEW.dispatch_id IS NOT OLD.dispatch_id OR NEW.dispatch_status IS NOT OLD.dispatch_status OR NEW.channel IS NOT OLD.channel OR NEW.occurred_at IS NOT OLD.occurred_at OR (OLD.invoked_at IS NOT NULL AND NEW.invoked_at IS NOT OLD.invoked_at)
BEGIN SELECT RAISE(ABORT,'customer_webhook_delivery_immutable'); END;
CREATE TRIGGER customer_webhook_delivery_transition BEFORE UPDATE OF status ON customer_webhook_deliveries WHEN NEW.status<>OLD.status AND NOT ((OLD.status='pending' AND NEW.status IN('sending','failed','superseded')) OR (OLD.status='sending' AND NEW.status IN('sent','failed','unknown')))
BEGIN SELECT RAISE(ABORT,'customer_webhook_transition_invalid'); END;
-- Restoring a previous role or workspace mode does not resurrect an old grant.
CREATE TRIGGER customer_webhook_member_downgrade AFTER UPDATE OF role ON memberships WHEN OLD.role='admin' AND NEW.role<>'admin'
BEGIN
 UPDATE customer_webhook_endpoints SET enabled=0,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id=OLD.organization_id AND updated_by=OLD.user_id AND status='active';
END;
CREATE TRIGGER customer_webhook_member_removal BEFORE DELETE ON memberships WHEN OLD.role='admin'
BEGIN
 UPDATE customer_webhook_endpoints SET enabled=0,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id=OLD.organization_id AND updated_by=OLD.user_id AND status='active';
END;
CREATE TRIGGER customer_webhook_workspace_mode AFTER UPDATE OF mode ON organizations WHEN OLD.mode='production' AND NEW.mode<>'production'
BEGIN
 UPDATE customer_webhook_endpoints SET enabled=0,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id=OLD.id AND status='active';
END;

-- Metadata is captured atomically with the source status, not reconstructed by polling.
CREATE TRIGGER customer_webhook_dispatch_insert AFTER INSERT ON dispatches WHEN NEW.mode='production'
BEGIN
 INSERT INTO customer_webhook_deliveries(id,organization_id,endpoint_id,endpoint_revision,event_id,dispatch_id,dispatch_status,channel,occurred_at)
 SELECT 'cwhd_'||lower(hex(randomblob(16))),NEW.organization_id,e.id,e.revision,'evt_'||NEW.id||'_'||NEW.status||'_'||NEW.updated_at,NEW.id,NEW.status,NEW.channel,NEW.updated_at FROM customer_webhook_endpoints e
 WHERE e.organization_id=NEW.organization_id AND e.status='active' AND e.enabled=1 AND EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=e.organization_id AND m.user_id=e.updated_by AND m.role='admin') AND NOT EXISTS(SELECT 1 FROM account_deletion_requests x WHERE x.user_id=e.updated_by AND x.status IN('processing','completed')) AND (SELECT count(*) FROM customer_webhook_deliveries d WHERE d.organization_id=e.organization_id AND d.endpoint_id=e.id AND d.status='pending')<500;
 UPDATE customer_webhook_endpoints SET overflow_count=overflow_count+1 WHERE organization_id=NEW.organization_id AND status='active' AND enabled=1 AND EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=customer_webhook_endpoints.organization_id AND m.user_id=customer_webhook_endpoints.updated_by AND m.role='admin') AND NOT EXISTS(SELECT 1 FROM account_deletion_requests x WHERE x.user_id=customer_webhook_endpoints.updated_by AND x.status IN('processing','completed')) AND NOT EXISTS(SELECT 1 FROM customer_webhook_deliveries d WHERE d.organization_id=NEW.organization_id AND d.endpoint_id=customer_webhook_endpoints.id AND d.event_id='evt_'||NEW.id||'_'||NEW.status||'_'||NEW.updated_at);
END;
CREATE TRIGGER customer_webhook_dispatch_status AFTER UPDATE OF status ON dispatches WHEN NEW.mode='production' AND NEW.status<>OLD.status
BEGIN
 INSERT INTO customer_webhook_deliveries(id,organization_id,endpoint_id,endpoint_revision,event_id,dispatch_id,dispatch_status,channel,occurred_at)
 SELECT 'cwhd_'||lower(hex(randomblob(16))),NEW.organization_id,e.id,e.revision,'evt_'||NEW.id||'_'||NEW.status||'_'||NEW.updated_at,NEW.id,NEW.status,NEW.channel,NEW.updated_at FROM customer_webhook_endpoints e
 WHERE e.organization_id=NEW.organization_id AND e.status='active' AND e.enabled=1 AND EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=e.organization_id AND m.user_id=e.updated_by AND m.role='admin') AND NOT EXISTS(SELECT 1 FROM account_deletion_requests x WHERE x.user_id=e.updated_by AND x.status IN('processing','completed')) AND (SELECT count(*) FROM customer_webhook_deliveries d WHERE d.organization_id=e.organization_id AND d.endpoint_id=e.id AND d.status='pending')<500;
 UPDATE customer_webhook_endpoints SET overflow_count=overflow_count+1 WHERE organization_id=NEW.organization_id AND status='active' AND enabled=1 AND EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=customer_webhook_endpoints.organization_id AND m.user_id=customer_webhook_endpoints.updated_by AND m.role='admin') AND NOT EXISTS(SELECT 1 FROM account_deletion_requests x WHERE x.user_id=customer_webhook_endpoints.updated_by AND x.status IN('processing','completed')) AND NOT EXISTS(SELECT 1 FROM customer_webhook_deliveries d WHERE d.organization_id=NEW.organization_id AND d.endpoint_id=customer_webhook_endpoints.id AND d.event_id='evt_'||NEW.id||'_'||NEW.status||'_'||NEW.updated_at);
END;
