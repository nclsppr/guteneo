-- Horizon is an explicitly accepted, fixed EUR30 monthly account-credit service.
-- Browser authority, debit and entitlement change in one SQLite transaction.
CREATE TABLE horizon_simulation_credit_grants (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
 amount_minor INTEGER NOT NULL DEFAULT 5000 CHECK(typeof(amount_minor)='integer' AND amount_minor=5000),
 created_at TEXT NOT NULL
);
CREATE TRIGGER horizon_simulation_credit_guard BEFORE INSERT ON horizon_simulation_credit_grants WHEN NOT EXISTS(SELECT 1 FROM organizations WHERE id=NEW.organization_id AND mode='simulation') BEGIN SELECT RAISE(ABORT,'horizon_simulation_only'); END;
CREATE TRIGGER horizon_simulation_credit_immutable BEFORE UPDATE ON horizon_simulation_credit_grants BEGIN SELECT RAISE(ABORT,'immutable_horizon_simulation_credit'); END;
CREATE TRIGGER horizon_simulation_credit_retained BEFORE DELETE ON horizon_simulation_credit_grants BEGIN SELECT RAISE(ABORT,'immutable_horizon_simulation_credit'); END;
CREATE TRIGGER horizon_simulation_credit_signup AFTER INSERT ON organizations WHEN NEW.mode='simulation' BEGIN INSERT INTO horizon_simulation_credit_grants(organization_id,created_at) VALUES(NEW.id,NEW.created_at); END;
INSERT INTO horizon_simulation_credit_grants(organization_id,created_at) SELECT id,created_at FROM organizations WHERE mode='simulation';

-- The browser subscription action is its immutable recurring-consent record.
-- Session hashes are provenance, not a foreign key: sessions remain revocable.
CREATE TABLE horizon_plan_actions (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 128),
 action TEXT NOT NULL CHECK(action IN ('subscribe','cancel','renew','past_due')),
 source TEXT NOT NULL CHECK(source IN ('browser','system')),
 evidence TEXT NOT NULL CHECK(evidence IN ('simulation','production')),
 user_id TEXT,
 session_hash TEXT,
 terms_version TEXT NOT NULL CHECK(terms_version='horizon-2026-10-02-v1'),
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor=3000),
 currency TEXT NOT NULL CHECK(currency='EUR'),
 payment_source TEXT NOT NULL CHECK(payment_source='account_credits'),
 interval TEXT NOT NULL CHECK(interval='month'),
 auto_renew INTEGER NOT NULL CHECK(auto_renew IN (0,1)),
 current_period_start TEXT,
 current_period_end TEXT,
 anchor_day INTEGER CHECK(anchor_day BETWEEN 1 AND 31),
 expected_period_end TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(organization_id,request_key),
 UNIQUE(organization_id,id),
 CHECK((source='browser' AND action IN ('subscribe','cancel') AND user_id IS NOT NULL AND session_hash IS NOT NULL) OR (source='system' AND action IN ('renew','past_due') AND user_id IS NULL AND session_hash IS NULL)),
 CHECK((action IN ('subscribe','renew') AND auto_renew=1 AND current_period_start IS NOT NULL AND current_period_end>current_period_start AND anchor_day IS NOT NULL) OR (action IN ('cancel','past_due') AND auto_renew=0 AND current_period_start IS NULL AND current_period_end IS NULL AND anchor_day IS NULL))
);
CREATE TRIGGER horizon_action_immutable BEFORE UPDATE ON horizon_plan_actions BEGIN SELECT RAISE(ABORT,'immutable_horizon_action'); END;
CREATE TRIGGER horizon_action_retained BEFORE DELETE ON horizon_plan_actions BEGIN SELECT RAISE(ABORT,'immutable_horizon_action'); END;
CREATE TABLE horizon_subscriptions (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
 evidence TEXT NOT NULL CHECK(evidence IN ('simulation','production')),
 status TEXT NOT NULL CHECK(status IN ('active','past_due','cancelled')),
 current_period_start TEXT NOT NULL,
 current_period_end TEXT NOT NULL CHECK(current_period_end>current_period_start),
 anchor_day INTEGER NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
 cancel_at_period_end INTEGER NOT NULL CHECK(cancel_at_period_end IN (0,1)),
 consent_action_id TEXT NOT NULL,
 last_action_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,consent_action_id) REFERENCES horizon_plan_actions(organization_id,id),
 FOREIGN KEY(organization_id,last_action_id) REFERENCES horizon_plan_actions(organization_id,id)
);
CREATE INDEX horizon_due ON horizon_subscriptions(cancel_at_period_end,status,current_period_end);
CREATE TABLE horizon_plan_charges (
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 evidence TEXT NOT NULL CHECK(evidence IN ('simulation','production')),
 current_period_start TEXT NOT NULL,
 current_period_end TEXT NOT NULL CHECK(current_period_end>current_period_start),
 action_id TEXT NOT NULL,
 consent_action_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor=3000),
 currency TEXT NOT NULL CHECK(currency='EUR'),
 created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,current_period_start),
 UNIQUE(organization_id,action_id),
 FOREIGN KEY(organization_id,action_id) REFERENCES horizon_plan_actions(organization_id,id),
 FOREIGN KEY(organization_id,consent_action_id) REFERENCES horizon_plan_actions(organization_id,id)
);
CREATE TRIGGER horizon_charge_immutable BEFORE UPDATE ON horizon_plan_charges BEGIN SELECT RAISE(ABORT,'immutable_horizon_charge'); END;
CREATE TRIGGER horizon_charge_retained BEFORE DELETE ON horizon_plan_charges BEGIN SELECT RAISE(ABORT,'immutable_horizon_charge'); END;
CREATE VIEW horizon_simulation_credit_balances AS SELECT g.organization_id,g.amount_minor AS granted_minor,COALESCE((SELECT SUM(c.amount_minor) FROM horizon_plan_charges c WHERE c.organization_id=g.organization_id AND c.evidence='simulation'),0) AS spent_minor,g.amount_minor-COALESCE((SELECT SUM(c.amount_minor) FROM horizon_plan_charges c WHERE c.organization_id=g.organization_id AND c.evidence='simulation'),0) AS available_minor FROM horizon_simulation_credit_grants g;

-- Preserve both historical dispatch consumption and the hosting service from 0040.
DROP VIEW welcome_credit_balances;
CREATE VIEW welcome_credit_balances AS SELECT g.organization_id,g.currency,g.amount_minor AS granted_minor,g.created_at AS granted_at,COALESCE((SELECT SUM(e.reserved_delta) FROM welcome_credit_entries e WHERE e.organization_id=g.organization_id),0) AS reserved_minor,COALESCE((SELECT SUM(e.spent_delta) FROM welcome_credit_entries e WHERE e.organization_id=g.organization_id),0)+COALESCE((SELECT SUM(h.amount_minor) FROM protected_hosting_charges h WHERE h.organization_id=g.organization_id),0)+COALESCE((SELECT SUM(c.amount_minor) FROM horizon_plan_charges c WHERE c.organization_id=g.organization_id AND c.evidence='production'),0) AS spent_minor,g.amount_minor-COALESCE((SELECT SUM(e.reserved_delta+e.spent_delta) FROM welcome_credit_entries e WHERE e.organization_id=g.organization_id),0)-COALESCE((SELECT SUM(h.amount_minor) FROM protected_hosting_charges h WHERE h.organization_id=g.organization_id),0)-COALESCE((SELECT SUM(c.amount_minor) FROM horizon_plan_charges c WHERE c.organization_id=g.organization_id AND c.evidence='production'),0) AS available_minor FROM welcome_credit_grants g;
CREATE VIEW horizon_available_credits AS SELECT organization_id,'production' AS evidence,available_minor FROM welcome_credit_balances UNION ALL SELECT organization_id,'simulation' AS evidence,available_minor FROM horizon_simulation_credit_balances;

CREATE TRIGGER horizon_action_guard BEFORE INSERT ON horizon_plan_actions BEGIN
 SELECT RAISE(ABORT,'horizon_mode_mismatch') WHERE NOT EXISTS(SELECT 1 FROM organizations WHERE id=NEW.organization_id AND mode=NEW.evidence);
 SELECT RAISE(ABORT,'horizon_period_invalid') WHERE NEW.action IN ('subscribe','renew') AND (NEW.current_period_start>NEW.created_at OR NEW.current_period_end<=NEW.created_at OR NEW.current_period_end<>(strftime('%Y-%m-',NEW.current_period_start,'start of month','+1 month')||printf('%02d',min(NEW.anchor_day,CAST(strftime('%d',NEW.current_period_start,'start of month','+2 months','-1 day') AS INTEGER)))||substr(NEW.current_period_start,11)) OR (NEW.action='subscribe' AND (NEW.current_period_start<>NEW.created_at OR NEW.anchor_day<>CAST(strftime('%d',NEW.created_at) AS INTEGER))) OR (NEW.action='renew' AND NEW.current_period_start<NEW.expected_period_end));
 SELECT RAISE(ABORT,'horizon_admin_required') WHERE NEW.source='browser' AND NOT EXISTS(SELECT 1 FROM browser_sessions s JOIN memberships m ON m.organization_id=s.organization_id AND m.user_id=s.user_id WHERE s.token_hash=NEW.session_hash AND s.organization_id=NEW.organization_id AND s.user_id=NEW.user_id AND m.role='admin' AND s.expires_at>NEW.created_at AND (NEW.evidence='simulation' OR (s.is_development=0 AND s.verified_account=1)));
 SELECT RAISE(ABORT,'horizon_renewal_stale') WHERE NEW.source='system' AND NOT EXISTS(SELECT 1 FROM horizon_subscriptions s JOIN horizon_plan_actions consent ON consent.organization_id=s.organization_id AND consent.id=s.consent_action_id WHERE s.organization_id=NEW.organization_id AND s.evidence=NEW.evidence AND s.status IN ('active','past_due') AND s.cancel_at_period_end=0 AND s.current_period_end=NEW.expected_period_end AND s.current_period_end<=NEW.created_at AND consent.action='subscribe' AND consent.auto_renew=1);
 SELECT RAISE(ABORT,'horizon_credit_exhausted') WHERE NEW.action IN ('subscribe','renew') AND (NEW.action='renew' OR NOT EXISTS(SELECT 1 FROM horizon_subscriptions WHERE organization_id=NEW.organization_id AND status IN ('active','cancelled') AND current_period_start<=NEW.created_at AND current_period_end>NEW.created_at)) AND NOT EXISTS(SELECT 1 FROM horizon_available_credits WHERE organization_id=NEW.organization_id AND evidence=NEW.evidence AND available_minor>=3000);
 SELECT RAISE(ABORT,'horizon_credit_available') WHERE NEW.action='past_due' AND EXISTS(SELECT 1 FROM horizon_available_credits WHERE organization_id=NEW.organization_id AND evidence=NEW.evidence AND available_minor>=3000);
END;
CREATE TRIGGER horizon_action_subscribe AFTER INSERT ON horizon_plan_actions WHEN NEW.action='subscribe' BEGIN
 INSERT INTO horizon_subscriptions(organization_id,evidence,status,current_period_start,current_period_end,anchor_day,cancel_at_period_end,consent_action_id,last_action_id,created_at,updated_at) VALUES(NEW.organization_id,NEW.evidence,'active',NEW.current_period_start,NEW.current_period_end,NEW.anchor_day,0,NEW.id,NEW.id,NEW.created_at,NEW.created_at) ON CONFLICT(organization_id) DO UPDATE SET status='active',current_period_start=iif(horizon_subscriptions.status IN ('active','cancelled') AND horizon_subscriptions.current_period_start<=NEW.created_at AND horizon_subscriptions.current_period_end>NEW.created_at,horizon_subscriptions.current_period_start,NEW.current_period_start),current_period_end=iif(horizon_subscriptions.status IN ('active','cancelled') AND horizon_subscriptions.current_period_start<=NEW.created_at AND horizon_subscriptions.current_period_end>NEW.created_at,horizon_subscriptions.current_period_end,NEW.current_period_end),anchor_day=iif(horizon_subscriptions.status IN ('active','cancelled') AND horizon_subscriptions.current_period_end>NEW.created_at,horizon_subscriptions.anchor_day,NEW.anchor_day),cancel_at_period_end=0,consent_action_id=NEW.id,last_action_id=NEW.id,updated_at=NEW.created_at;
 INSERT INTO horizon_plan_charges(organization_id,evidence,current_period_start,current_period_end,action_id,consent_action_id,amount_minor,currency,created_at) SELECT organization_id,evidence,current_period_start,current_period_end,NEW.id,consent_action_id,3000,'EUR',NEW.created_at FROM horizon_subscriptions WHERE organization_id=NEW.organization_id AND NOT EXISTS(SELECT 1 FROM horizon_plan_charges WHERE organization_id=NEW.organization_id AND current_period_start=horizon_subscriptions.current_period_start);
END;
CREATE TRIGGER horizon_action_cancel AFTER INSERT ON horizon_plan_actions WHEN NEW.action='cancel' BEGIN UPDATE horizon_subscriptions SET status='cancelled',cancel_at_period_end=1,last_action_id=NEW.id,updated_at=NEW.created_at WHERE organization_id=NEW.organization_id; END;
CREATE TRIGGER horizon_action_renew AFTER INSERT ON horizon_plan_actions WHEN NEW.action='renew' BEGIN
 UPDATE horizon_subscriptions SET status='active',current_period_start=NEW.current_period_start,current_period_end=NEW.current_period_end,anchor_day=NEW.anchor_day,last_action_id=NEW.id,updated_at=NEW.created_at WHERE organization_id=NEW.organization_id;
 INSERT INTO horizon_plan_charges(organization_id,evidence,current_period_start,current_period_end,action_id,consent_action_id,amount_minor,currency,created_at) SELECT organization_id,evidence,current_period_start,current_period_end,NEW.id,consent_action_id,3000,'EUR',NEW.created_at FROM horizon_subscriptions WHERE organization_id=NEW.organization_id;
END;
CREATE TRIGGER horizon_action_past_due AFTER INSERT ON horizon_plan_actions WHEN NEW.action='past_due' BEGIN UPDATE horizon_subscriptions SET status='past_due',last_action_id=NEW.id,updated_at=NEW.created_at WHERE organization_id=NEW.organization_id; END;
CREATE TRIGGER horizon_charge_guard BEFORE INSERT ON horizon_plan_charges BEGIN
 SELECT RAISE(ABORT,'horizon_charge_invalid') WHERE NOT EXISTS(SELECT 1 FROM horizon_subscriptions s JOIN horizon_plan_actions a ON a.organization_id=s.organization_id AND a.id=s.last_action_id JOIN horizon_plan_actions consent ON consent.organization_id=s.organization_id AND consent.id=s.consent_action_id WHERE s.organization_id=NEW.organization_id AND s.status='active' AND s.evidence=NEW.evidence AND s.current_period_start=NEW.current_period_start AND s.current_period_end=NEW.current_period_end AND a.id=NEW.action_id AND a.action IN ('subscribe','renew') AND consent.id=NEW.consent_action_id AND consent.action='subscribe' AND consent.auto_renew=1 AND NEW.created_at=a.created_at);
 SELECT RAISE(ABORT,'horizon_credit_exhausted') WHERE NOT EXISTS(SELECT 1 FROM horizon_available_credits WHERE organization_id=NEW.organization_id AND evidence=NEW.evidence AND available_minor>=3000);
END;
CREATE TRIGGER horizon_subscription_create_guard BEFORE INSERT ON horizon_subscriptions BEGIN
 SELECT RAISE(ABORT,'horizon_subscription_invalid') WHERE NOT EXISTS(SELECT 1 FROM horizon_plan_actions WHERE organization_id=NEW.organization_id AND id=NEW.last_action_id AND id=NEW.consent_action_id AND action='subscribe' AND evidence=NEW.evidence AND NEW.status='active' AND NEW.cancel_at_period_end=0 AND current_period_start=NEW.current_period_start AND current_period_end=NEW.current_period_end AND anchor_day=NEW.anchor_day AND created_at=NEW.created_at AND created_at=NEW.updated_at);
END;
CREATE TRIGGER horizon_subscription_guard BEFORE UPDATE ON horizon_subscriptions BEGIN
 SELECT RAISE(ABORT,'immutable_horizon_subscription') WHERE NEW.organization_id<>OLD.organization_id OR NEW.evidence<>OLD.evidence OR NEW.created_at<>OLD.created_at OR NEW.updated_at<OLD.updated_at OR NEW.last_action_id=OLD.last_action_id OR NOT EXISTS(SELECT 1 FROM horizon_plan_actions a WHERE a.organization_id=NEW.organization_id AND a.id=NEW.last_action_id AND a.created_at=NEW.updated_at AND ((a.action='subscribe' AND NEW.status='active' AND NEW.cancel_at_period_end=0 AND NEW.consent_action_id=a.id AND NEW.current_period_start=iif(OLD.status IN ('active','cancelled') AND OLD.current_period_start<=a.created_at AND OLD.current_period_end>a.created_at,OLD.current_period_start,a.current_period_start) AND NEW.current_period_end=iif(OLD.status IN ('active','cancelled') AND OLD.current_period_start<=a.created_at AND OLD.current_period_end>a.created_at,OLD.current_period_end,a.current_period_end) AND NEW.anchor_day=iif(OLD.status IN ('active','cancelled') AND OLD.current_period_end>a.created_at,OLD.anchor_day,a.anchor_day)) OR (a.action='cancel' AND NEW.status='cancelled' AND NEW.cancel_at_period_end=1 AND NEW.current_period_start=OLD.current_period_start AND NEW.current_period_end=OLD.current_period_end AND NEW.anchor_day=OLD.anchor_day AND NEW.consent_action_id=OLD.consent_action_id) OR (a.action='renew' AND NEW.status='active' AND NEW.cancel_at_period_end=0 AND NEW.current_period_start=a.current_period_start AND NEW.current_period_end=a.current_period_end AND NEW.anchor_day=a.anchor_day AND NEW.consent_action_id=OLD.consent_action_id) OR (a.action='past_due' AND NEW.status='past_due' AND NEW.cancel_at_period_end=0 AND NEW.current_period_start=OLD.current_period_start AND NEW.current_period_end=OLD.current_period_end AND NEW.anchor_day=OLD.anchor_day AND NEW.consent_action_id=OLD.consent_action_id)));
END;
CREATE TRIGGER horizon_subscription_retained BEFORE DELETE ON horizon_subscriptions BEGIN SELECT RAISE(ABORT,'immutable_horizon_subscription'); END;
