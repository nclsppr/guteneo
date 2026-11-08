-- Operational closure is independent of delivery success and financial settlement.
-- This view grants no authority to retry, invoke a provider or release a hold.
CREATE VIEW operationally_closed_dispatches AS
 SELECT d.organization_id,d.id AS dispatch_id FROM dispatches d
 WHERE (d.status IN ('delivered','failed','cancelled','bounced','complained') OR (d.channel='postal' AND d.status='handed_to_post'))
 AND d.lease_until IS NULL
 AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.organization_id=d.organization_id AND r.dispatch_id=d.id AND r.status='reserved')
 AND NOT EXISTS(SELECT 1 FROM welcome_credit_reservations r WHERE r.organization_id=d.organization_id AND r.dispatch_id=d.id AND r.status='reserved')
 AND ((d.active_attempt_id IS NULL AND d.provider IS NULL AND d.provider_id IS NULL AND NOT EXISTS(SELECT 1 FROM outbox o WHERE o.organization_id=d.organization_id AND o.dispatch_id=d.id)) OR (EXISTS(SELECT 1 FROM reservations r WHERE r.organization_id=d.organization_id AND r.dispatch_id=d.id AND r.status IN ('confirmed','released')) AND (d.mode='simulation' OR EXISTS(SELECT 1 FROM welcome_credit_reservations r WHERE r.organization_id=d.organization_id AND r.dispatch_id=d.id AND r.status IN ('settled','released')))))
 AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=d.organization_id AND a.dispatch_id=d.id AND a.status IN ('started','unknown') AND NOT EXISTS(SELECT 1 FROM provider_events e WHERE a.id=d.active_attempt_id AND a.provider=d.provider AND (a.provider_id IS NULL OR a.provider_id=d.provider_id) AND d.provider_id IS NOT NULL AND e.organization_id=d.organization_id AND e.dispatch_id=d.id AND e.provider=d.provider AND e.provider_id=d.provider_id AND e.applied_at IS NOT NULL AND (e.kind IN ('delivered','failed','bounced','complained') OR (d.channel='postal' AND e.kind='handed_to_post'))));

CREATE VIEW completable_campaigns AS
 SELECT c.organization_id,c.id AS campaign_id FROM campaigns c
 WHERE c.status='frozen' AND c.manifest_hash IS NOT NULL
 AND EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=c.organization_id AND d.campaign_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=c.organization_id AND d.campaign_id=c.id AND NOT EXISTS(SELECT 1 FROM operationally_closed_dispatches closed WHERE closed.organization_id=d.organization_id AND closed.dispatch_id=d.id));

CREATE TRIGGER campaign_initial_state_guard BEFORE INSERT ON campaigns WHEN NEW.status<>'draft' OR NEW.manifest_hash IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'campaign_initial_state_invalid');
END;
CREATE TRIGGER campaign_completion_guard BEFORE UPDATE OF status ON campaigns WHEN NEW.status='completed' AND OLD.status<>'completed'
BEGIN
 SELECT RAISE(ABORT,'campaign_not_closed') WHERE OLD.status<>'frozen' OR NOT EXISTS(SELECT 1 FROM completable_campaigns c WHERE c.organization_id=OLD.organization_id AND c.campaign_id=OLD.id);
END;
CREATE TRIGGER campaign_lifecycle_immutable BEFORE UPDATE ON campaigns WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.id IS NOT OLD.id OR NEW.created_at IS NOT OLD.created_at OR (OLD.manifest_hash IS NOT NULL AND NEW.manifest_hash IS NOT OLD.manifest_hash) OR (OLD.status IN ('frozen','completed') AND NEW.status='draft') OR (OLD.status='completed' AND NEW.status<>'completed')
BEGIN
 SELECT RAISE(ABORT,'campaign_immutable');
END;
CREATE TRIGGER frozen_campaign_member_retained BEFORE DELETE ON dispatches WHEN OLD.campaign_id IS NOT NULL AND EXISTS(SELECT 1 FROM campaigns c WHERE c.organization_id=OLD.organization_id AND c.id=OLD.campaign_id AND c.status IN ('frozen','completed'))
BEGIN
 SELECT RAISE(ABORT,'campaign_frozen');
END;
CREATE TRIGGER completed_campaign_execution_guard BEFORE UPDATE OF status,lease_until ON dispatches WHEN NEW.campaign_id IS NOT NULL AND (NEW.status NOT IN ('delivered','failed','cancelled','bounced','complained') AND NOT (NEW.channel='postal' AND NEW.status='handed_to_post') OR NEW.lease_until IS NOT NULL) AND EXISTS(SELECT 1 FROM campaigns c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.campaign_id AND c.status='completed')
BEGIN
 SELECT RAISE(ABORT,'campaign_completed');
END;

-- Each final prerequisite can arrive last: manifest, delivery fact, attempt or hold.
CREATE TRIGGER campaign_manifest_completion AFTER UPDATE OF manifest_hash ON campaigns WHEN NEW.status='frozen' AND NEW.manifest_hash IS NOT NULL
BEGIN
 UPDATE campaigns SET status='completed' WHERE organization_id=NEW.organization_id AND id=NEW.id AND EXISTS(SELECT 1 FROM completable_campaigns c WHERE c.organization_id=NEW.organization_id AND c.campaign_id=NEW.id);
END;
CREATE TRIGGER campaign_dispatch_completion AFTER UPDATE OF status,lease_until,provider_id ON dispatches WHEN NEW.campaign_id IS NOT NULL
BEGIN
 UPDATE campaigns SET status='completed',updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND id=NEW.campaign_id AND EXISTS(SELECT 1 FROM completable_campaigns c WHERE c.organization_id=NEW.organization_id AND c.campaign_id=NEW.campaign_id);
END;
CREATE TRIGGER campaign_attempt_completion AFTER UPDATE OF status ON attempts
BEGIN
 UPDATE campaigns SET status='completed',updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND id IN (SELECT campaign_id FROM dispatches WHERE organization_id=NEW.organization_id AND id=NEW.dispatch_id) AND EXISTS(SELECT 1 FROM completable_campaigns c WHERE c.organization_id=campaigns.organization_id AND c.campaign_id=campaigns.id);
END;
CREATE TRIGGER campaign_event_completion AFTER UPDATE OF applied_at ON provider_events WHEN NEW.applied_at IS NOT NULL AND OLD.applied_at IS NULL
BEGIN
 UPDATE campaigns SET status='completed',updated_at=NEW.applied_at WHERE organization_id=NEW.organization_id AND id IN (SELECT campaign_id FROM dispatches WHERE organization_id=NEW.organization_id AND id=NEW.dispatch_id) AND EXISTS(SELECT 1 FROM completable_campaigns c WHERE c.organization_id=campaigns.organization_id AND c.campaign_id=campaigns.id);
END;
CREATE TRIGGER campaign_quota_completion AFTER UPDATE OF status ON reservations WHEN NEW.status IN ('confirmed','released')
BEGIN
 UPDATE campaigns SET status='completed',updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND id IN (SELECT campaign_id FROM dispatches WHERE organization_id=NEW.organization_id AND id=NEW.dispatch_id) AND EXISTS(SELECT 1 FROM completable_campaigns c WHERE c.organization_id=campaigns.organization_id AND c.campaign_id=campaigns.id);
END;
CREATE TRIGGER campaign_credit_completion AFTER UPDATE OF status ON welcome_credit_reservations WHEN NEW.status IN ('settled','released')
BEGIN
 UPDATE campaigns SET status='completed',updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND id IN (SELECT campaign_id FROM dispatches WHERE organization_id=NEW.organization_id AND id=NEW.dispatch_id) AND EXISTS(SELECT 1 FROM completable_campaigns c WHERE c.organization_id=campaigns.organization_id AND c.campaign_id=campaigns.id);
END;

-- Upgrade only frozen campaigns whose retained execution and financial proof is closed.
UPDATE campaigns SET status='completed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE EXISTS(SELECT 1 FROM completable_campaigns c WHERE c.organization_id=campaigns.organization_id AND c.campaign_id=campaigns.id);
