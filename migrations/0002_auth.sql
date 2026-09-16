-- Identity and browser sessions are separate from immutable delivery approvals.
CREATE TABLE auth_identities (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (issuer, subject)
);
CREATE TABLE auth_transactions (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX auth_transactions_expiry ON auth_transactions(expires_at);
CREATE TABLE browser_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  mfa INTEGER NOT NULL CHECK (mfa IN (0, 1)),
  is_development INTEGER NOT NULL CHECK (is_development IN (0, 1)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, user_id) REFERENCES memberships(organization_id, user_id)
);
CREATE INDEX browser_sessions_expiry ON browser_sessions(expires_at);
CREATE INDEX browser_sessions_user ON browser_sessions(user_id);
CREATE TABLE authorized_connections (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  client_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'revoked')),
  not_before INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (issuer, user_id, client_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES memberships(organization_id, user_id)
);
CREATE INDEX authorized_connections_org ON authorized_connections(organization_id, user_id, status);
CREATE TABLE development_mcp_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, user_id) REFERENCES memberships(organization_id, user_id)
);
