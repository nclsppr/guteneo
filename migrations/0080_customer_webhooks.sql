-- Customer webhooks: HTTPS endpoints a workspace administrator registers to
-- receive a signed notice when a dispatch changes status. No signing secret is
-- stored: it is derived from a server key, the endpoint id and secret_version.
CREATE TABLE webhook_endpoints(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  url TEXT NOT NULL CHECK(substr(url,1,8)='https://' AND length(url)<=500),
  secret_version INTEGER NOT NULL DEFAULT 1 CHECK(secret_version>=1),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX webhook_endpoints_url ON webhook_endpoints(organization_id,url);

-- One row per notice and endpoint. It names the dispatch, its channel and its
-- new status only: never a recipient, content, document or amount.
CREATE TABLE webhook_deliveries(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id),
  dispatch_id TEXT NOT NULL,
  status TEXT NOT NULL,
  channel TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','delivered','abandoned')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_response INTEGER,
  delivered_at TEXT
);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries(state,next_attempt_at);
CREATE INDEX webhook_deliveries_endpoint ON webhook_deliveries(organization_id,endpoint_id,occurred_at);

-- Queued in the same transaction as the status change. The insert reads only
-- columns the dispatch always has and an endpoint that exists, so it cannot
-- make the status change fail; a workspace without endpoints inserts nothing.
CREATE TRIGGER webhook_dispatch_status AFTER UPDATE OF status ON dispatches
WHEN NEW.status IS NOT OLD.status
BEGIN
  INSERT INTO webhook_deliveries(id,organization_id,endpoint_id,dispatch_id,status,channel,occurred_at,next_attempt_at)
  SELECT 'whd_'||lower(hex(randomblob(16))),NEW.organization_id,e.id,NEW.id,NEW.status,NEW.channel,
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM webhook_endpoints e WHERE e.organization_id=NEW.organization_id AND e.enabled=1;
END;
