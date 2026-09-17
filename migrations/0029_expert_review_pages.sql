-- Receipt of all page batches permits issuing a short-lived delegated review.
-- It does not attest human consent or model comprehension.
CREATE TABLE expert_document_review_progress (
  organization_id TEXT NOT NULL,
  dispatch_id TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES expert_approval_policies(connection_id),
  user_id TEXT NOT NULL REFERENCES users(id),
  policy_revision INTEGER NOT NULL,
  connection_updated_at TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_sha256 TEXT NOT NULL CHECK(length(document_sha256)=64),
  total_pages INTEGER NOT NULL CHECK(total_pages BETWEEN 1 AND 100),
  next_page INTEGER NOT NULL CHECK(next_page BETWEEN 2 AND 101),
  expires_at TEXT NOT NULL,
  PRIMARY KEY(organization_id,dispatch_id,connection_id),
  FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id),
  FOREIGN KEY(organization_id,document_id) REFERENCES documents(organization_id,id)
);
CREATE INDEX expert_review_progress_expiry ON expert_document_review_progress(expires_at);
