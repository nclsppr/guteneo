-- One lifetime promotional EUR grant per production organization. This is not
-- a Stripe balance, invoice, cash deposit or a monthly per-channel allowance.
CREATE TABLE welcome_credit_grants (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 amount_minor INTEGER NOT NULL DEFAULT 5000 CHECK(typeof(amount_minor)='integer' AND amount_minor=5000),
 currency TEXT NOT NULL DEFAULT 'EUR' CHECK(currency='EUR'),
 created_at TEXT NOT NULL
);
CREATE TRIGGER welcome_credit_grant_production BEFORE INSERT ON welcome_credit_grants WHEN NOT EXISTS(SELECT 1 FROM organizations WHERE id=NEW.organization_id AND mode='production') BEGIN SELECT RAISE(ABORT,'credit_production_only'); END;
CREATE TRIGGER welcome_credit_grant_once BEFORE INSERT ON welcome_credit_grants WHEN EXISTS(SELECT 1 FROM welcome_credit_grants WHERE organization_id=NEW.organization_id) BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER welcome_credit_grant_immutable BEFORE UPDATE ON welcome_credit_grants BEGIN SELECT RAISE(ABORT,'immutable_welcome_credit'); END;
CREATE TRIGGER welcome_credit_grant_retained BEFORE DELETE ON welcome_credit_grants WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id) BEGIN SELECT RAISE(ABORT,'immutable_welcome_credit'); END;
CREATE TRIGGER welcome_credit_signup AFTER INSERT ON organizations WHEN NEW.mode='production' BEGIN INSERT INTO welcome_credit_grants(organization_id,created_at) VALUES(NEW.id,NEW.created_at) ON CONFLICT(organization_id) DO NOTHING; END;
INSERT INTO welcome_credit_grants(organization_id,created_at) SELECT id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM organizations WHERE mode='production' ON CONFLICT(organization_id) DO NOTHING;
-- Upgrade only untouched, disabled-channel onboarding zeros. Active-channel
-- stops and explicit nonzero operator limits remain unchanged.
UPDATE usage SET limit_count=10000,limit_minor=5000 WHERE limit_count=0 AND limit_minor=0 AND reserved_count=0 AND confirmed_count=0 AND reserved_minor=0 AND confirmed_minor=0 AND EXISTS(SELECT 1 FROM welcome_credit_grants WHERE organization_id=usage.organization_id) AND EXISTS(SELECT 1 FROM channel_controls WHERE organization_id=usage.organization_id AND channel=usage.channel AND enabled=0);

CREATE TABLE welcome_credit_reservations (
 organization_id TEXT NOT NULL REFERENCES welcome_credit_grants(organization_id) ON DELETE CASCADE,
 dispatch_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 0 AND 5000),
 charge_minor INTEGER NOT NULL CHECK(typeof(charge_minor)='integer' AND charge_minor BETWEEN 0 AND amount_minor),
 status TEXT NOT NULL CHECK(status IN ('reserved','settled','released')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,dispatch_id),
 FOREIGN KEY(organization_id,dispatch_id) REFERENCES dispatches(organization_id,id) ON DELETE CASCADE
);
-- Journal entries retain the dispatch ID as a tenant-scoped immutable reference,
-- like audit_log. Removing a historical dispatch must never refund its charge.
CREATE TABLE welcome_credit_entries (
 organization_id TEXT NOT NULL REFERENCES welcome_credit_grants(organization_id) ON DELETE CASCADE,
 dispatch_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('reserved','settled','released')),
 reserved_delta INTEGER NOT NULL CHECK(typeof(reserved_delta)='integer' AND reserved_delta BETWEEN -5000 AND 5000),
 spent_delta INTEGER NOT NULL CHECK(typeof(spent_delta)='integer' AND spent_delta BETWEEN 0 AND 5000),
 created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,dispatch_id,kind)
);
CREATE TRIGGER welcome_credit_entry_immutable BEFORE UPDATE ON welcome_credit_entries BEGIN SELECT RAISE(ABORT,'immutable_credit_entry'); END;
CREATE TRIGGER welcome_credit_entry_retained BEFORE DELETE ON welcome_credit_entries WHEN EXISTS(SELECT 1 FROM welcome_credit_grants WHERE organization_id=OLD.organization_id) BEGIN SELECT RAISE(ABORT,'immutable_credit_entry'); END;
CREATE TRIGGER welcome_credit_entry_guard BEFORE INSERT ON welcome_credit_entries BEGIN
 SELECT RAISE(ABORT,'credit_entry_invalid') WHERE NOT EXISTS(SELECT 1 FROM welcome_credit_reservations r WHERE r.organization_id=NEW.organization_id AND r.dispatch_id=NEW.dispatch_id AND r.status=NEW.kind AND ((NEW.kind='reserved' AND NEW.reserved_delta=r.amount_minor AND NEW.spent_delta=0) OR (NEW.kind='settled' AND NEW.reserved_delta=-r.amount_minor AND NEW.spent_delta=r.charge_minor) OR (NEW.kind='released' AND NEW.reserved_delta=-r.amount_minor AND NEW.spent_delta=0)));
 SELECT RAISE(ABORT,'credit_entry_invalid') WHERE NEW.kind<>'reserved' AND NOT EXISTS(SELECT 1 FROM welcome_credit_entries WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND kind='reserved');
END;
CREATE VIEW welcome_credit_balances AS SELECT g.organization_id,g.currency,g.amount_minor AS granted_minor,g.created_at AS granted_at,COALESCE(SUM(e.reserved_delta),0) AS reserved_minor,COALESCE(SUM(e.spent_delta),0) AS spent_minor,g.amount_minor-COALESCE(SUM(e.reserved_delta+e.spent_delta),0) AS available_minor FROM welcome_credit_grants g LEFT JOIN welcome_credit_entries e ON e.organization_id=g.organization_id GROUP BY g.organization_id;
CREATE TRIGGER welcome_credit_reservation_guard BEFORE INSERT ON welcome_credit_reservations BEGIN
 SELECT RAISE(ABORT,'credit_reservation_invalid') WHERE NEW.status<>'reserved' OR NOT EXISTS(SELECT 1 FROM dispatches WHERE organization_id=NEW.organization_id AND id=NEW.dispatch_id AND mode='production' AND status='queued' AND currency='EUR' AND ceiling_minor=NEW.amount_minor AND estimated_minor=NEW.charge_minor);
 SELECT RAISE(ABORT,'credit_exhausted') WHERE NOT EXISTS(SELECT 1 FROM welcome_credit_balances WHERE organization_id=NEW.organization_id AND available_minor>0 AND available_minor>=NEW.amount_minor);
END;
CREATE TRIGGER welcome_credit_reservation_immutable BEFORE UPDATE ON welcome_credit_reservations WHEN NEW.organization_id<>OLD.organization_id OR NEW.dispatch_id<>OLD.dispatch_id OR NEW.amount_minor<>OLD.amount_minor OR NEW.charge_minor<>OLD.charge_minor OR NEW.created_at<>OLD.created_at OR OLD.status<>'reserved' OR NEW.status NOT IN ('settled','released') BEGIN SELECT RAISE(ABORT,'immutable_credit_reservation'); END;
CREATE TRIGGER welcome_credit_reservation_retained BEFORE DELETE ON welcome_credit_reservations WHEN EXISTS(SELECT 1 FROM dispatches WHERE organization_id=OLD.organization_id AND id=OLD.dispatch_id) AND EXISTS(SELECT 1 FROM welcome_credit_grants WHERE organization_id=OLD.organization_id) BEGIN SELECT RAISE(ABORT,'immutable_credit_reservation'); END;
CREATE TRIGGER welcome_credit_settlement_guard BEFORE UPDATE ON welcome_credit_reservations BEGIN
 SELECT RAISE(ABORT,'credit_settlement_invalid') WHERE NEW.status='settled' AND NOT EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND (d.status IN ('accepted','delivered','printed','handed_to_post','bounced','complained') OR (d.status='failed' AND (EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=d.organization_id AND a.dispatch_id=d.id AND a.id=d.active_attempt_id AND a.status='accepted' AND a.provider=d.provider AND a.provider_id=d.provider_id) OR EXISTS(SELECT 1 FROM provider_events e WHERE e.organization_id=d.organization_id AND e.dispatch_id=d.id AND e.provider=d.provider AND e.provider_id=d.provider_id AND e.kind='accepted' AND e.applied_at IS NOT NULL)))));
 SELECT RAISE(ABORT,'credit_settlement_invalid') WHERE NEW.status='released' AND NOT EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND d.status IN ('cancelled','failed') AND d.provider_id IS NULL AND ((d.active_attempt_id IS NULL AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=d.organization_id AND a.dispatch_id=d.id)) OR (d.status='failed' AND EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=d.organization_id AND a.dispatch_id=d.id AND a.id=d.active_attempt_id AND a.status='rejected'))));
END;
CREATE TRIGGER welcome_credit_reservation_entry AFTER INSERT ON welcome_credit_reservations BEGIN INSERT INTO welcome_credit_entries(organization_id,dispatch_id,kind,reserved_delta,spent_delta,created_at) VALUES(NEW.organization_id,NEW.dispatch_id,'reserved',NEW.amount_minor,0,NEW.created_at); END;
CREATE TRIGGER welcome_credit_settlement_entry AFTER UPDATE ON welcome_credit_reservations WHEN NEW.status='settled' BEGIN INSERT INTO welcome_credit_entries(organization_id,dispatch_id,kind,reserved_delta,spent_delta,created_at) VALUES(NEW.organization_id,NEW.dispatch_id,'settled',-NEW.amount_minor,NEW.charge_minor,NEW.updated_at); END;
CREATE TRIGGER welcome_credit_release_entry AFTER UPDATE ON welcome_credit_reservations WHEN NEW.status='released' BEGIN INSERT INTO welcome_credit_entries(organization_id,dispatch_id,kind,reserved_delta,spent_delta,created_at) VALUES(NEW.organization_id,NEW.dispatch_id,'released',-NEW.amount_minor,0,NEW.updated_at); END;
CREATE TRIGGER welcome_credit_accept AFTER UPDATE OF status ON dispatches WHEN OLD.status='prepared' AND NEW.status='queued' AND NEW.mode='production' BEGIN INSERT INTO welcome_credit_reservations(organization_id,dispatch_id,amount_minor,charge_minor,status,created_at,updated_at) VALUES(NEW.organization_id,NEW.id,NEW.ceiling_minor,NEW.estimated_minor,'reserved',NEW.updated_at,NEW.updated_at); END;
CREATE TRIGGER welcome_credit_confirm AFTER UPDATE OF status ON dispatches WHEN NEW.mode='production' AND NEW.status IN ('accepted','delivered','printed','handed_to_post','bounced','complained') BEGIN
 SELECT RAISE(ABORT,'credit_reservation_closed') WHERE EXISTS(SELECT 1 FROM welcome_credit_reservations WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND status='released');
 UPDATE welcome_credit_reservations SET status='settled',updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND status='reserved';
END;
-- A failure callback can still incur supplier/SIP/partial-page charges. Only a
-- command stopped without an attempt, or a proved rejected attempt, frees credit.
CREATE TRIGGER welcome_credit_release AFTER UPDATE OF status ON dispatches WHEN NEW.mode='production' AND NEW.status IN ('cancelled','failed') AND OLD.status IN ('prepared','queued') AND NEW.active_attempt_id IS NULL AND NEW.provider_id IS NULL AND NOT EXISTS(SELECT 1 FROM attempts WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id) BEGIN UPDATE welcome_credit_reservations SET status='released',updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.id AND status='reserved'; END;
CREATE TRIGGER welcome_credit_rejected AFTER UPDATE OF status ON attempts WHEN OLD.status='started' AND NEW.status='rejected' BEGIN UPDATE welcome_credit_reservations SET status='released',updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved' AND EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND d.active_attempt_id=NEW.id AND d.mode='production' AND d.status='failed' AND d.provider_id IS NULL); END;
-- Delivery projection stays monotone. A positive acceptance arriving after a
-- failure can still settle the quote without changing the visible failed state.
CREATE TRIGGER welcome_credit_attempt_accepted AFTER UPDATE OF status ON attempts WHEN NEW.status='accepted' AND NEW.provider_id IS NOT NULL AND EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND d.active_attempt_id=NEW.id AND d.mode='production' AND d.status='failed' AND d.provider=NEW.provider AND d.provider_id=NEW.provider_id) BEGIN
 SELECT RAISE(ABORT,'credit_reservation_closed') WHERE EXISTS(SELECT 1 FROM welcome_credit_reservations WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='released');
 UPDATE welcome_credit_reservations SET status='settled',updated_at=NEW.updated_at WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved';
END;
CREATE TRIGGER welcome_credit_event_accepted AFTER UPDATE OF applied_at ON provider_events WHEN OLD.applied_at IS NULL AND NEW.applied_at IS NOT NULL AND NEW.kind='accepted' AND NEW.provider_id IS NOT NULL AND EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=NEW.organization_id AND d.id=NEW.dispatch_id AND d.mode='production' AND d.status='failed' AND d.provider=NEW.provider AND d.provider_id=NEW.provider_id) BEGIN
 SELECT RAISE(ABORT,'credit_reservation_closed') WHERE EXISTS(SELECT 1 FROM welcome_credit_reservations WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='released');
 UPDATE welcome_credit_reservations SET status='settled',updated_at=NEW.applied_at WHERE organization_id=NEW.organization_id AND dispatch_id=NEW.dispatch_id AND status='reserved';
END;
