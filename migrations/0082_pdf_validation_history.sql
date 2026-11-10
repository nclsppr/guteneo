-- Workspace history remains a bounded chronological read, independent of purchase.
CREATE INDEX pdf_validation_history ON pdf_validations(organization_id,created_at DESC,id DESC);
