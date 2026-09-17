-- Explicit proof from a signed scoped Auth0 Action. Historical sessions are not
-- silently upgraded when the operator selects the verified-email beta policy.
ALTER TABLE browser_sessions ADD COLUMN verified_account INTEGER NOT NULL DEFAULT 0 CHECK(verified_account IN (0,1));
