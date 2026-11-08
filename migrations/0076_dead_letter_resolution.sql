-- Resolution is diagnostic closure, never permission to replay queue work.
CREATE TRIGGER dead_letter_resolution_guard BEFORE UPDATE OF resolved_at ON dead_letters
WHEN NEW.resolved_at IS NOT OLD.resolved_at
BEGIN
 SELECT RAISE(ABORT,'dead_letter_resolution_immutable') WHERE OLD.resolved_at IS NOT NULL OR NEW.resolved_at IS NULL;
 SELECT RAISE(ABORT,'dead_letter_resolution_invalid_time') WHERE strftime('%Y-%m-%dT%H:%M:%fZ',NEW.resolved_at,'+0 seconds') IS NOT NEW.resolved_at OR NEW.resolved_at<OLD.received_at;
 SELECT RAISE(ABORT,'dead_letter_dispatch_still_open') WHERE NOT EXISTS(SELECT 1 FROM operationally_closed_dispatches c WHERE c.dispatch_id=OLD.dispatch_id);
 SELECT RAISE(ABORT,'dead_letter_resolution_receipt_required') WHERE NOT EXISTS(SELECT 1 FROM audit_log a JOIN operationally_closed_dispatches c ON c.organization_id=a.organization_id AND c.dispatch_id=OLD.dispatch_id WHERE a.id='dead_letter_resolved_'||OLD.id AND a.resource_id=OLD.id AND a.action='dead_letter.resolved' AND a.created_at=NEW.resolved_at);
END;
CREATE TRIGGER retained_dead_letter_identity BEFORE UPDATE ON dead_letters
WHEN NEW.id IS NOT OLD.id OR NEW.dispatch_id IS NOT OLD.dispatch_id OR NEW.queue IS NOT OLD.queue OR NEW.received_at IS NOT OLD.received_at
BEGIN
 SELECT RAISE(ABORT,'dead_letter_identity_immutable');
END;
