-- Recipient-held email controls are separate from document access capabilities.
ALTER TABLE dispatches ADD COLUMN recipient_feedback TEXT
 CHECK(recipient_feedback IS NULL OR recipient_feedback IN ('unsubscribed','reported'));
CREATE TABLE email_recipient_feedback_tokens (
 token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64),
 organization_id TEXT NOT NULL,
 dispatch_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(organization_id,dispatch_id),
 FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id)
);
CREATE TRIGGER email_feedback_token_immutable BEFORE UPDATE ON email_recipient_feedback_tokens BEGIN
 SELECT RAISE(ABORT,'email_feedback_token_immutable');
END;
-- A complaint cannot later be hidden by replaying the unsubscribe action.
CREATE TRIGGER recipient_feedback_monotonic BEFORE UPDATE OF recipient_feedback ON dispatches
 WHEN OLD.recipient_feedback='reported' AND NEW.recipient_feedback IS NOT 'reported'
 BEGIN
 SELECT RAISE(ABORT,'recipient_feedback_immutable');
END;
