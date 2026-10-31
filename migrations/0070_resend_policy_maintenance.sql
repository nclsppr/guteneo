-- Scheduled qualification of an already selected Resend account. Installs no
-- account, credential, budget, sender, channel or sending authority.
CREATE TABLE resend_policy_refresh_state (
 account_id TEXT PRIMARY KEY,
 domain_id TEXT NOT NULL,
 route_id TEXT NOT NULL,
 qualified_until TEXT,
 rate_json TEXT CHECK(rate_json IS NULL OR json_valid(rate_json)),
 source_sha256 TEXT,
 last_success_at TEXT,
 last_attempt_at TEXT,
 last_error_code TEXT,
 blocked_reason TEXT,
 blocked_reasons_json TEXT CHECK(blocked_reasons_json IS NULL OR (json_valid(blocked_reasons_json) AND json_type(blocked_reasons_json)='array')),
 next_attempt_at TEXT NOT NULL,
 lease_token TEXT,
 lease_until TEXT,
 failure_count INTEGER NOT NULL DEFAULT 0 CHECK(failure_count BETWEEN 0 AND 16)
);
CREATE TABLE resend_policy_refresh_evidence (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 domain_id TEXT NOT NULL,
 route_id TEXT NOT NULL,
 observed_at TEXT NOT NULL,
 qualified_until TEXT NOT NULL,
 domain_sha256 TEXT CHECK((length(domain_sha256)=64) IS TRUE),
 usage_sha256 TEXT CHECK(length(usage_sha256)=64),
 pricing_sha256 TEXT CHECK((length(pricing_sha256)=64) IS TRUE),
 fx_sha256 TEXT CHECK((length(fx_sha256)=64) IS TRUE),
 rate_json TEXT CHECK((json_valid(rate_json)) IS TRUE),
 limits_json TEXT CHECK((json_valid(limits_json)) IS TRUE),
 previous_policy_json TEXT CHECK((json_valid(previous_policy_json)) IS TRUE)
);
CREATE TRIGGER immutable_resend_policy_refresh_evidence BEFORE UPDATE ON resend_policy_refresh_evidence
BEGIN
 SELECT RAISE(ABORT,'immutable_resend_policy_refresh_evidence');
END;
CREATE TRIGGER retained_resend_policy_refresh_evidence BEFORE DELETE ON resend_policy_refresh_evidence
BEGIN
 SELECT RAISE(ABORT,'immutable_resend_policy_refresh_evidence');
END;
