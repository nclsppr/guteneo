-- A preparer's approval request is an audit receipt read with its dispatch.
-- The partial index keeps that read bounded to the dispatch instead of the
-- workspace's whole audit history. It stores no new data.
CREATE INDEX approval_request_receipts ON audit_log(organization_id,resource_id) WHERE action='dispatch.approval_requested';
