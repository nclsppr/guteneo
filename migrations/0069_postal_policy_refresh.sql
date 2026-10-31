-- Maintain only an existing, enabled postal sender/profile generation.
-- This creates no sender declaration, channel, provider draft or consent.
CREATE TABLE postal_policy_refresh_state (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
 last_attempt_at TEXT,
 last_success_at TEXT,
 last_error_code TEXT CHECK(
  last_error_code='PROFILE_UNAVAILABLE' OR last_error_code='PROFILE_CHANGED'
  OR last_error_code='BINDING_CHANGED' OR last_error_code='QUOTE_ACTIVE'
  OR last_error_code='COMMIT_CHANGED' OR last_error_code='DATABASE_UNAVAILABLE'
 ),
 next_due_at TEXT NOT NULL,
 lease_token TEXT,
 lease_until TEXT,
 failure_count INTEGER NOT NULL DEFAULT 0 CHECK(failure_count BETWEEN 0 AND 16)
);
CREATE INDEX due_postal_policy_refresh ON postal_policy_refresh_state(next_due_at,lease_until);
