-- Replace recurring access with one explicitly approved, credit-funded check.
-- Applied historical journals and subscription records remain immutable.
ALTER TABLE pdf_validations ADD COLUMN purchase_terms_version TEXT;
ALTER TABLE pdf_validations ADD COLUMN purchase_price_minor INTEGER;
ALTER TABLE pdf_validations ADD COLUMN purchase_source TEXT;
ALTER TABLE pdf_validations ADD COLUMN completed_at TEXT;
CREATE INDEX pdf_validation_deadlines ON pdf_validations(status,deadline_at,organization_id,id);
CREATE INDEX pdf_validation_completed ON pdf_validations(organization_id,status,completed_at,id);

CREATE TABLE pdf_validation_purchases (
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 validation_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor=10),
 currency TEXT NOT NULL CHECK(currency='EUR'),
 evidence TEXT NOT NULL CHECK(evidence IN ('production','simulation')),
 terms_version TEXT NOT NULL CHECK(terms_version='pdf-check-2026-10-25-v1'),
 approval_source TEXT NOT NULL CHECK(approval_source='browser_administrator'),
 approved_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,validation_id),
 FOREIGN KEY(organization_id,validation_id) REFERENCES pdf_validations(organization_id,id)
);
CREATE TRIGGER pdf_purchase_immutable BEFORE UPDATE ON pdf_validation_purchases BEGIN
 SELECT RAISE(ABORT,'immutable_pdf_purchase');
END;
CREATE TRIGGER pdf_purchase_retained BEFORE DELETE ON pdf_validation_purchases BEGIN
 SELECT RAISE(ABORT,'immutable_pdf_purchase');
END;
CREATE TRIGGER pdf_validation_retained BEFORE DELETE ON pdf_validations WHEN EXISTS(SELECT 1 FROM pdf_validation_purchases p WHERE p.organization_id=OLD.organization_id AND p.validation_id=OLD.id) BEGIN
 SELECT RAISE(ABORT,'immutable_pdf_purchase');
END;

CREATE VIEW pdf_validation_credit_effects AS
SELECT p.organization_id,p.evidence,
 COALESCE(SUM(p.amount_minor) FILTER (WHERE v.status='processing'),0) reserved_minor,
 COALESCE(SUM(p.amount_minor) FILTER (WHERE v.status='complete'),0) spent_minor
FROM pdf_validation_purchases p JOIN pdf_validations v ON v.organization_id=p.organization_id AND v.id=p.validation_id
GROUP BY p.organization_id,p.evidence;

DROP VIEW welcome_credit_balances;
CREATE VIEW welcome_credit_balances AS
SELECT g.organization_id,g.currency,g.amount_minor AS granted_minor,g.created_at AS granted_at,
 COALESCE((SELECT SUM(e.reserved_delta) FROM welcome_credit_entries e WHERE e.organization_id=g.organization_id),0)+COALESCE(v.reserved_minor,0) AS reserved_minor,
 COALESCE((SELECT SUM(e.spent_delta) FROM welcome_credit_entries e WHERE e.organization_id=g.organization_id),0)+COALESCE((SELECT SUM(h.amount_minor) FROM protected_hosting_charges h WHERE h.organization_id=g.organization_id),0)+COALESCE((SELECT SUM(c.amount_minor) FROM horizon_plan_charges c WHERE c.organization_id=g.organization_id AND c.evidence='production'),0)+COALESCE((SELECT SUM(s.amount_minor) FROM secure_distribution_charges s WHERE s.organization_id=g.organization_id AND s.evidence='production'),0)+COALESCE(v.spent_minor,0) AS spent_minor,
 g.amount_minor-COALESCE((SELECT SUM(e.reserved_delta+e.spent_delta) FROM welcome_credit_entries e WHERE e.organization_id=g.organization_id),0)-COALESCE((SELECT SUM(h.amount_minor) FROM protected_hosting_charges h WHERE h.organization_id=g.organization_id),0)-COALESCE((SELECT SUM(c.amount_minor) FROM horizon_plan_charges c WHERE c.organization_id=g.organization_id AND c.evidence='production'),0)-COALESCE((SELECT SUM(s.amount_minor) FROM secure_distribution_charges s WHERE s.organization_id=g.organization_id AND s.evidence='production'),0)-COALESCE(v.reserved_minor,0)-COALESCE(v.spent_minor,0) AS available_minor
FROM welcome_credit_grants g LEFT JOIN pdf_validation_credit_effects v ON v.organization_id=g.organization_id AND v.evidence='production';

CREATE VIEW pdf_validation_available_credits AS
SELECT organization_id,'production' AS evidence,available_minor FROM welcome_credit_balances
UNION ALL
SELECT g.organization_id,'simulation' AS evidence,
 g.amount_minor-COALESCE((SELECT SUM(c.amount_minor) FROM horizon_plan_charges c WHERE c.organization_id=g.organization_id AND c.evidence='simulation'),0)-COALESCE((SELECT SUM(s.amount_minor) FROM secure_distribution_charges s WHERE s.organization_id=g.organization_id AND s.evidence='simulation'),0)-COALESCE(v.reserved_minor,0)-COALESCE(v.spent_minor,0) available_minor
FROM horizon_simulation_credit_grants g LEFT JOIN pdf_validation_credit_effects v ON v.organization_id=g.organization_id AND v.evidence='simulation';

DROP TRIGGER pdf_validation_insert_guard;
CREATE TRIGGER pdf_validation_insert_guard BEFORE INSERT ON pdf_validations BEGIN
 SELECT RAISE(ABORT,'pdf_validation_authority') WHERE NEW.status<>'processing' OR NEW.result_json IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.purchase_source IS NOT 'browser_administrator' OR NEW.purchase_terms_version IS NOT 'pdf-check-2026-10-25-v1' OR NEW.purchase_price_minor IS NOT 10 OR NOT EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id JOIN documents d ON d.organization_id=m.organization_id WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.request_user_id AND m.role='admin' AND o.mode=NEW.evidence AND d.id=NEW.document_id AND d.sha256=NEW.document_sha256 AND d.status='ready' AND (d.access_owner_id IS NULL OR d.access_owner_id=NEW.request_user_id));
 SELECT RAISE(ABORT,'pdf_validation_busy') WHERE (SELECT COUNT(*) FROM pdf_validations WHERE organization_id=NEW.organization_id AND status='processing' AND deadline_at>NEW.created_at)>=2;
END;
CREATE TRIGGER pdf_purchase_guard BEFORE INSERT ON pdf_validation_purchases BEGIN
 SELECT RAISE(ABORT,'pdf_validation_purchase_invalid') WHERE NOT EXISTS(SELECT 1 FROM pdf_validations v WHERE v.organization_id=NEW.organization_id AND v.id=NEW.validation_id AND v.status='processing' AND v.purchase_price_minor=NEW.amount_minor AND v.purchase_terms_version=NEW.terms_version AND v.purchase_source=NEW.approval_source AND v.evidence=NEW.evidence AND v.request_user_id=NEW.approved_by AND v.created_at=NEW.created_at);
 SELECT RAISE(ABORT,'pdf_validation_credit_insufficient') WHERE NOT EXISTS(SELECT 1 FROM pdf_validation_available_credits b WHERE b.organization_id=NEW.organization_id AND b.evidence=NEW.evidence AND b.available_minor>=NEW.amount_minor);
END;
CREATE TRIGGER pdf_validation_purchase AFTER INSERT ON pdf_validations BEGIN
 INSERT INTO pdf_validation_purchases(organization_id,validation_id,amount_minor,currency,evidence,terms_version,approval_source,approved_by,created_at) VALUES(NEW.organization_id,NEW.id,NEW.purchase_price_minor,'EUR',NEW.evidence,NEW.purchase_terms_version,NEW.purchase_source,NEW.request_user_id,NEW.created_at);
END;
CREATE TRIGGER pdf_validation_purchase_state BEFORE UPDATE ON pdf_validations BEGIN
 SELECT RAISE(ABORT,'immutable_pdf_purchase') WHERE NEW.purchase_terms_version IS NOT OLD.purchase_terms_version OR NEW.purchase_price_minor IS NOT OLD.purchase_price_minor OR NEW.purchase_source IS NOT OLD.purchase_source;
 SELECT RAISE(ABORT,'pdf_validation_purchase_invalid') WHERE NEW.status='complete' AND (NEW.completed_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ',NEW.completed_at,'+0 seconds') IS NOT NEW.completed_at OR NEW.completed_at<NEW.created_at OR NEW.completed_at>=NEW.deadline_at OR NOT EXISTS(SELECT 1 FROM pdf_validation_purchases p JOIN memberships m ON m.organization_id=p.organization_id AND m.user_id=p.approved_by JOIN organizations o ON o.id=p.organization_id JOIN documents d ON d.organization_id=p.organization_id WHERE p.organization_id=NEW.organization_id AND p.validation_id=NEW.id AND p.evidence=o.mode AND m.role='admin' AND d.id=NEW.document_id AND d.sha256=NEW.document_sha256 AND d.status='ready' AND (d.access_owner_id IS NULL OR d.access_owner_id=p.approved_by)));
 SELECT RAISE(ABORT,'pdf_validation_purchase_invalid') WHERE NEW.status='error' AND NEW.completed_at IS NOT NULL;
END;

CREATE TRIGGER legacy_monthly_plan_retired BEFORE INSERT ON horizon_plan_actions WHEN NEW.action IN ('subscribe','renew') BEGIN
 SELECT RAISE(ABORT,'monthly_plan_retired');
END;
