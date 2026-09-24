-- Native preparation/read sessions are not browser approval or MCP authority.
CREATE TABLE native_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  browser_session_hash TEXT NOT NULL REFERENCES browser_sessions(token_hash) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  code_challenge TEXT NOT NULL CHECK(length(code_challenge)=43),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id) ON DELETE CASCADE
);
CREATE INDEX native_authorization_codes_expiry ON native_authorization_codes(expires_at);
CREATE TABLE native_sessions (
  token_hash TEXT PRIMARY KEY,
  browser_session_hash TEXT NOT NULL REFERENCES browser_sessions(token_hash) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id) ON DELETE CASCADE
);
CREATE INDEX native_sessions_owner ON native_sessions(organization_id,user_id);
CREATE INDEX native_sessions_expiry ON native_sessions(expires_at);
-- Request receipt is not deletion completion. Evidence/retention review is required.
CREATE TABLE account_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  status TEXT NOT NULL CHECK(status IN ('requested','processing','completed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  processing_at TEXT,
  completed_at TEXT,
  processing_reference TEXT,
  CHECK((status='completed' AND completed_at IS NOT NULL) OR (status!='completed' AND completed_at IS NULL))
);
