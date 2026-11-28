-- Public commercial data, shared only within one exact platform provider scope.
-- A quote copies its terms and evidence; it never depends on retention of old buckets.
CREATE TABLE worldwide_fax_catalog_state (
 scope TEXT PRIMARY KEY,
 revision TEXT,
 last_failure_at TEXT,
 next_due_at TEXT NOT NULL,
 lease_token TEXT,
 lease_until TEXT
);
CREATE TABLE worldwide_fax_catalog_decks (
 id TEXT PRIMARY KEY,
 scope TEXT NOT NULL REFERENCES worldwide_fax_catalog_state(scope),
 deck_sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL,
 complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN (0,1))
);
CREATE INDEX worldwide_fax_deck_reuse ON worldwide_fax_catalog_decks(scope,deck_sha256,complete);
CREATE TABLE worldwide_fax_catalog_revisions (
 deck_id TEXT NOT NULL REFERENCES worldwide_fax_catalog_decks(id),
 id TEXT PRIMARY KEY,
 scope TEXT NOT NULL REFERENCES worldwide_fax_catalog_state(scope),
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
 created_at TEXT NOT NULL
);
CREATE INDEX worldwide_fax_catalog_history ON worldwide_fax_catalog_revisions(scope,created_at);
CREATE TABLE worldwide_fax_catalog_buckets (
 deck_id TEXT NOT NULL REFERENCES worldwide_fax_catalog_decks(id) ON DELETE CASCADE,
 bucket TEXT NOT NULL,
 routes TEXT NOT NULL,
 PRIMARY KEY(deck_id,bucket)
);
