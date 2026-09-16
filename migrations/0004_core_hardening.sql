-- Recheck critical predicates in the same SQLite write as preparation/acceptance.
CREATE TRIGGER dispatch_document_ready BEFORE INSERT ON dispatches WHEN NEW.document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM documents WHERE organization_id=NEW.organization_id AND id=NEW.document_id AND status='ready') BEGIN SELECT RAISE(ABORT,'document_not_ready'); END;
CREATE TRIGGER dispatch_sender_ready BEFORE INSERT ON dispatches WHEN NOT EXISTS(SELECT 1 FROM senders WHERE organization_id=NEW.organization_id AND id=NEW.sender_id AND channel=NEW.channel AND mode=NEW.mode AND status='verified') BEGIN SELECT RAISE(ABORT,'sender_not_ready'); END;
CREATE TRIGGER campaign_size_bound BEFORE INSERT ON dispatches WHEN NEW.campaign_id IS NOT NULL AND (SELECT count(*) FROM dispatches WHERE organization_id=NEW.organization_id AND campaign_id=NEW.campaign_id)>=500 BEGIN SELECT RAISE(ABORT,'campaign_too_large'); END;
CREATE TRIGGER acceptance_readiness BEFORE UPDATE OF status ON dispatches WHEN OLD.status='prepared' AND NEW.status='queued' BEGIN
 SELECT CASE WHEN NEW.document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM documents WHERE organization_id=NEW.organization_id AND id=NEW.document_id AND status='ready') THEN RAISE(ABORT,'document_not_ready') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM senders WHERE organization_id=NEW.organization_id AND id=NEW.sender_id AND channel=NEW.channel AND mode=NEW.mode AND status='verified') THEN RAISE(ABORT,'sender_not_ready') END;
 SELECT CASE WHEN NEW.channel='email' AND EXISTS(SELECT 1 FROM suppressions WHERE organization_id=NEW.organization_id AND email=json_extract(NEW.recipient_json,'$.email')) THEN RAISE(ABORT,'recipient_suppressed') END;
END;
CREATE TRIGGER immutable_sender BEFORE UPDATE ON senders WHEN NEW.organization_id<>OLD.organization_id OR NEW.address<>OLD.address OR NEW.channel<>OLD.channel OR NEW.mode<>OLD.mode BEGIN SELECT RAISE(ABORT,'immutable_sender'); END;
