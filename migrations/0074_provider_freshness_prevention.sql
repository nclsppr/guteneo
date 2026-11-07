-- Operational prevention only. No provider authority, tariff or send is renewed.
-- The notification outbox is also the unique milestone ledger; terminal or
-- uncertain provider outcomes cannot return to pending.
CREATE TABLE provider_freshness_prevention_tasks (
 organization_id TEXT NOT NULL,
 task_sha256 TEXT NOT NULL CHECK(length(task_sha256)=64 AND task_sha256 NOT GLOB '*[^0-9a-f]*'),
 family TEXT NOT NULL CHECK(family IN ('fax_tariff','delivery_policy','fax_authority','resend_tariff','resend_send_limits')),
 binding_sha256 TEXT NOT NULL,
 revision_sha256 TEXT NOT NULL CHECK(length(revision_sha256)=64 AND revision_sha256 NOT GLOB '*[^0-9a-f]*'),
 deadline_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',deadline_at,'+0 seconds') IS deadline_at),
 renewal_mode TEXT NOT NULL CHECK(renewal_mode IN ('automatic','operator')),
 stage TEXT NOT NULL,
 stage_rank INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','resolved')),
 occurrence INTEGER NOT NULL DEFAULT 1 CHECK(occurrence>=1),
 opened_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',opened_at,'+0 seconds') IS opened_at),
 last_evaluated_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',last_evaluated_at,'+0 seconds') IS last_evaluated_at AND last_evaluated_at>=opened_at),
 resolved_at TEXT,
 resolution TEXT,
 PRIMARY KEY(organization_id,task_sha256),
 FOREIGN KEY(organization_id,family,binding_sha256) REFERENCES provider_freshness_bindings(organization_id,family,binding_sha256) ON DELETE CASCADE,
 CHECK((renewal_mode='operator' AND ((stage='operator_7d' AND stage_rank=1) OR (stage='operator_3d' AND stage_rank=2) OR (stage='operator_1d' AND stage_rank=3))) OR (renewal_mode='automatic' AND ((stage='automatic_48h' AND stage_rank=2) OR (stage='automatic_24h' AND stage_rank=3))) OR (stage='expired' AND stage_rank=4)),
 CHECK(family<>'fax_authority' OR renewal_mode='operator'),
 CHECK((state='active' AND resolved_at IS NULL AND resolution IS NULL) OR (state='resolved' AND strftime('%Y-%m-%dT%H:%M:%fZ',resolved_at,'+0 seconds') IS resolved_at AND resolved_at>=opened_at AND resolution IN ('replaced','disabled')))
);
CREATE INDEX active_provider_freshness_prevention ON provider_freshness_prevention_tasks(state,deadline_at);
CREATE TABLE provider_freshness_prevention_notifications (
 organization_id TEXT NOT NULL,
 notification_sha256 TEXT NOT NULL CHECK(length(notification_sha256)=64 AND notification_sha256 NOT GLOB '*[^0-9a-f]*'),
 task_sha256 TEXT NOT NULL,
 occurrence INTEGER NOT NULL CHECK(occurrence>=1),
 stage TEXT NOT NULL CHECK(stage IN ('operator_7d','operator_3d','operator_1d','automatic_48h','automatic_24h','expired')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','unknown','failed','superseded')),
 created_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds') IS created_at),
 updated_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds') IS updated_at AND updated_at>=created_at),
 envelope_sha256 TEXT CHECK(envelope_sha256 IS NULL OR (length(envelope_sha256)=64 AND envelope_sha256 NOT GLOB '*[^0-9a-f]*')),
 claimed_at TEXT,
 lease_until TEXT,
 provider_reference TEXT CHECK(provider_reference IS NULL OR (length(provider_reference)>0 AND length(provider_reference)<=512)),
 finished_at TEXT,
 error_code TEXT CHECK(error_code IS NULL OR (length(error_code)>0 AND length(error_code)<=64 AND error_code NOT GLOB '*[^A-Z0-9_]*')),
 PRIMARY KEY(organization_id,notification_sha256),
 UNIQUE(organization_id,task_sha256,occurrence,stage),
 FOREIGN KEY(organization_id,task_sha256) REFERENCES provider_freshness_prevention_tasks(organization_id,task_sha256) ON DELETE CASCADE,
 CHECK(claimed_at IS NULL OR (strftime('%Y-%m-%dT%H:%M:%fZ',claimed_at,'+0 seconds') IS claimed_at AND claimed_at>=created_at)),
 CHECK(lease_until IS NULL OR (strftime('%Y-%m-%dT%H:%M:%fZ',lease_until,'+0 seconds') IS lease_until AND lease_until>claimed_at)),
 CHECK(finished_at IS NULL OR (strftime('%Y-%m-%dT%H:%M:%fZ',finished_at,'+0 seconds') IS finished_at AND finished_at>=created_at)),
 CHECK((status='pending' AND claimed_at IS NULL AND lease_until IS NULL AND finished_at IS NULL AND provider_reference IS NULL AND error_code IS NULL)
 OR (status='sending' AND envelope_sha256 IS NOT NULL AND claimed_at IS NOT NULL AND lease_until IS NOT NULL AND finished_at IS NULL AND provider_reference IS NULL AND error_code IS NULL)
 OR (status='sent' AND envelope_sha256 IS NOT NULL AND claimed_at IS NOT NULL AND finished_at IS NOT NULL AND provider_reference IS NOT NULL AND error_code IS NULL)
 OR (status IN ('unknown','failed') AND envelope_sha256 IS NOT NULL AND claimed_at IS NOT NULL AND finished_at IS NOT NULL AND error_code IS NOT NULL)
 OR (status='superseded' AND claimed_at IS NULL AND lease_until IS NULL AND finished_at IS NOT NULL AND provider_reference IS NULL AND error_code IS NULL))
);
CREATE INDEX pending_provider_freshness_notifications ON provider_freshness_prevention_notifications(status,created_at);
CREATE INDEX claimed_provider_freshness_notifications ON provider_freshness_prevention_notifications(claimed_at) WHERE claimed_at IS NOT NULL;
CREATE TRIGGER immutable_provider_freshness_prevention_task BEFORE UPDATE ON provider_freshness_prevention_tasks
WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.task_sha256 IS NOT OLD.task_sha256
 OR NEW.family IS NOT OLD.family OR NEW.binding_sha256 IS NOT OLD.binding_sha256 OR NEW.revision_sha256 IS NOT OLD.revision_sha256
 OR NEW.deadline_at IS NOT OLD.deadline_at OR NEW.renewal_mode IS NOT OLD.renewal_mode OR NEW.opened_at IS NOT OLD.opened_at
 OR NEW.last_evaluated_at<OLD.last_evaluated_at
 OR NOT (NEW.occurrence=OLD.occurrence OR (OLD.state='resolved' AND NEW.state='active' AND NEW.occurrence=OLD.occurrence+1))
 OR (OLD.state='resolved' AND NEW.state='active' AND NEW.occurrence<>OLD.occurrence+1)
 OR (NEW.occurrence=OLD.occurrence AND NEW.stage_rank<OLD.stage_rank)
BEGIN
 SELECT RAISE(ABORT,'immutable_provider_freshness_prevention_task');
END;
CREATE TRIGGER immutable_provider_freshness_prevention_notification BEFORE UPDATE ON provider_freshness_prevention_notifications
WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.notification_sha256 IS NOT OLD.notification_sha256
 OR NEW.task_sha256 IS NOT OLD.task_sha256 OR NEW.occurrence IS NOT OLD.occurrence OR NEW.stage IS NOT OLD.stage
 OR NEW.created_at IS NOT OLD.created_at OR NEW.updated_at<OLD.updated_at
 OR (OLD.envelope_sha256 IS NOT NULL AND NEW.envelope_sha256 IS NOT OLD.envelope_sha256)
 OR (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS NOT OLD.claimed_at)
 OR NOT (NEW.status=OLD.status OR (OLD.status='pending' AND NEW.status IN ('sending','superseded')) OR (OLD.status='sending' AND NEW.status IN ('sent','unknown','failed')))
BEGIN
 SELECT RAISE(ABORT,'immutable_provider_freshness_prevention_notification');
END;
CREATE TRIGGER retain_provider_freshness_prevention_task BEFORE DELETE ON provider_freshness_prevention_tasks
WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id)
BEGIN
 SELECT RAISE(ABORT,'retained_provider_freshness_prevention_task');
END;
CREATE TRIGGER retain_provider_freshness_prevention_notification BEFORE DELETE ON provider_freshness_prevention_notifications
WHEN EXISTS(SELECT 1 FROM organizations WHERE id=OLD.organization_id)
BEGIN
 SELECT RAISE(ABORT,'retained_provider_freshness_prevention_notification');
END;
