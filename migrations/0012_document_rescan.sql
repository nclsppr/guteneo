-- Manual retries are separate from upload/render budgets and never fund sending.
CREATE TABLE document_scan_usage (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  rescans INTEGER NOT NULL DEFAULT 0 CHECK(rescans>=0 AND rescans<=10),
  warmups INTEGER NOT NULL DEFAULT 0 CHECK(warmups>=0 AND warmups<=3),
  PRIMARY KEY(organization_id,day)
);
CREATE TABLE document_scan_locks (
  organization_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(organization_id,document_id),
  FOREIGN KEY(organization_id,document_id) REFERENCES documents(organization_id,id) ON DELETE CASCADE
);
