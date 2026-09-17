CREATE TABLE content_limits(organization_id TEXT PRIMARY KEY REFERENCES organizations(id),uploads_per_day INTEGER NOT NULL CHECK(uploads_per_day>=0),bytes_per_day INTEGER NOT NULL CHECK(bytes_per_day>=0),renders_per_day INTEGER NOT NULL CHECK(renders_per_day>=0));
CREATE TABLE content_usage(organization_id TEXT NOT NULL REFERENCES organizations(id),day TEXT NOT NULL,uploads INTEGER NOT NULL DEFAULT 0,bytes INTEGER NOT NULL DEFAULT 0,renders INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(organization_id,day));
CREATE INDEX documents_retention ON documents(status,created_at,id);
-- Only existing local simulation fixtures receive documentary credits. New real organizations have none.
INSERT INTO content_limits SELECT id,100,104857600,50 FROM organizations WHERE mode='simulation';
