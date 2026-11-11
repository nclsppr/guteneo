-- Scheduled sending: an approver reviews a fax or email dispatch and asks for
-- its acceptance at a later time. The row is the recorded human consent: it
-- binds the reviewed version (fingerprint), and through it the content,
-- recipient, options and spending ceiling. At release the scheduler writes an
-- ordinary browser approval that names this row, then runs the usual atomic
-- acceptance; an expired fax quote is renewed with identical content first.
CREATE TABLE scheduled_releases(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  dispatch_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  approver_id TEXT NOT NULL,
  recipient_requested INTEGER NOT NULL DEFAULT 0 CHECK(recipient_requested IN (0,1)),
  release_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'scheduled' CHECK(state IN ('scheduled','releasing','released','refused','cancelled','uncertain')),
  released_dispatch_id TEXT,
  outcome_code TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE UNIQUE INDEX scheduled_releases_open ON scheduled_releases(organization_id,dispatch_id) WHERE state IN ('scheduled','releasing');
CREATE INDEX scheduled_releases_due ON scheduled_releases(state,release_at);
CREATE INDEX scheduled_releases_dispatch ON scheduled_releases(organization_id,dispatch_id,created_at);

-- An approval written at release names the consent it executes, so a deferred
-- acceptance is never mistaken for a decision taken at that instant.
ALTER TABLE approvals ADD COLUMN scheduled_release_id TEXT;
