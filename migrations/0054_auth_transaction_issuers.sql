-- Bind each short-lived, single-use browser flow to its exact token endpoint
-- and stable identity namespace. Existing NULL rows predate browser aliases and
-- continue at the canonical AUTH0_DOMAIN; no identity or authority is rewritten.
ALTER TABLE auth_transactions ADD COLUMN authorization_issuer TEXT
  CHECK(authorization_issuer IS NULL OR length(authorization_issuer)>0);
ALTER TABLE auth_transactions ADD COLUMN identity_issuer TEXT
  CHECK(identity_issuer IS NULL OR length(identity_issuer)>0);
