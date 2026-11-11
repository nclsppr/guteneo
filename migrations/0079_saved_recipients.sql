-- Fax numbers and email addresses a workspace saves to reuse when preparing.
-- Tenant scoped; rows carry no member identity, so erasing a member's account
-- leaves the workspace's list, and the audit log records who saved or removed
-- an entry without the address itself.
CREATE TABLE saved_recipients(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  channel TEXT NOT NULL CHECK(channel IN ('fax','email')),
  address TEXT NOT NULL CHECK(length(address) BETWEEN 3 AND 320),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX saved_recipients_address ON saved_recipients(organization_id,channel,address);
