-- Personal authority is independent of membership. No synthetic workshop,
-- credit, quota or sender is created for a document recipient.
ALTER TABLE auth_transactions ADD COLUMN account_context TEXT NOT NULL DEFAULT 'workshop'
  CHECK(account_context IN ('personal','workshop'));

CREATE TABLE personal_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL,
  verified_email TEXT,
  identity_issuer TEXT,
  identity_subject TEXT,
  identity_authenticated_at TEXT,
  mfa INTEGER NOT NULL CHECK(mfa IN (0,1)),
  verified_account INTEGER NOT NULL CHECK(verified_account IN (0,1)),
  authenticated_at INTEGER CHECK(authenticated_at IS NULL OR authenticated_at>0),
  amr_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(amr_json)),
  acr TEXT,
  strong_authentication INTEGER NOT NULL DEFAULT 0 CHECK(strong_authentication IN (0,1)),
  authentication_policy_version TEXT,
  is_development INTEGER NOT NULL CHECK(is_development IN (0,1)),
  public_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX personal_sessions_user ON personal_sessions(user_id,expires_at);
CREATE INDEX personal_sessions_expiry ON personal_sessions(expires_at);
CREATE TRIGGER browser_session_personal_revocation AFTER DELETE ON browser_sessions BEGIN
  DELETE FROM personal_sessions WHERE token_hash=OLD.token_hash;
END;

CREATE TABLE personal_workspace_creations (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id),
  created_at TEXT NOT NULL
);

CREATE TABLE personal_http_limits (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK(count>0)
);
