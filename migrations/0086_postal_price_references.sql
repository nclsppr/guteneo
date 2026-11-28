-- Commercial observations only. Keys match the exact normal-paper calculator
-- inputs and sender/account scope. No PDF, address, or consent is stored here.
CREATE TABLE postal_price_references (
 organization_id TEXT NOT NULL,
 sender_id TEXT NOT NULL,
 account_id TEXT NOT NULL,
 environment TEXT NOT NULL CHECK(environment IN ('production','sandbox')),
 country TEXT NOT NULL CHECK(length(country)=2),
 paper_count INTEGER NOT NULL CHECK(paper_count BETWEEN 1 AND 320),
 options_json TEXT NOT NULL CHECK(json_valid(options_json)),
 supplier_minor INTEGER CHECK(supplier_minor IS NULL OR (typeof(supplier_minor)='integer' AND supplier_minor BETWEEN 1 AND 500000)),
 observed_at TEXT,
 next_due_at TEXT NOT NULL,
 lease_token TEXT,
 lease_until TEXT,
 CHECK((supplier_minor IS NULL)=(observed_at IS NULL)),
 PRIMARY KEY(organization_id,sender_id,account_id,environment,country,paper_count,options_json),
 FOREIGN KEY(organization_id,sender_id) REFERENCES senders(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX due_postal_price_references ON postal_price_references(next_due_at,lease_until);
