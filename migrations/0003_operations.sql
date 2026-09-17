CREATE TABLE http_limits(organization_id TEXT NOT NULL REFERENCES organizations(id), window_start INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(organization_id,window_start));
CREATE TABLE dead_letters(id TEXT PRIMARY KEY, dispatch_id TEXT, queue TEXT NOT NULL, received_at TEXT NOT NULL, resolved_at TEXT);
CREATE TABLE provider_receipts(provider TEXT NOT NULL, event_id TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','projected','unrecognized')), received_at TEXT NOT NULL, PRIMARY KEY(provider,event_id));
CREATE INDEX provider_receipts_pending ON provider_receipts(status,received_at);
CREATE TABLE document_access_grants(token_hash TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id), dispatch_id TEXT NOT NULL REFERENCES dispatches(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
