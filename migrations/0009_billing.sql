-- Stripe projections contain billing metadata only, never documents or signed URLs.
CREATE TABLE billing_accounts (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  livemode INTEGER NOT NULL CHECK(livemode IN (0,1)),
  customer_id TEXT,
  provision_started_at INTEGER NOT NULL,
  sync_token TEXT,
  sync_until INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(organization_id,livemode),
  UNIQUE(livemode,customer_id),
  UNIQUE(organization_id,livemode,customer_id)
);
CREATE TABLE billing_invoices (
  organization_id TEXT NOT NULL,
  livemode INTEGER NOT NULL,
  customer_id TEXT NOT NULL,
  id TEXT NOT NULL,
  number TEXT,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_minor INTEGER NOT NULL,
  amount_due_minor INTEGER NOT NULL,
  amount_paid_minor INTEGER NOT NULL,
  amount_remaining_minor INTEGER NOT NULL,
  created INTEGER NOT NULL,
  due_date INTEGER,
  synced_at TEXT NOT NULL,
  PRIMARY KEY(organization_id,livemode,id),
  FOREIGN KEY(organization_id,livemode,customer_id) REFERENCES billing_accounts(organization_id,livemode,customer_id)
);
CREATE INDEX billing_invoices_page ON billing_invoices(organization_id,livemode,created DESC,id DESC);
CREATE TABLE billing_payments (
  organization_id TEXT NOT NULL,
  livemode INTEGER NOT NULL,
  customer_id TEXT NOT NULL,
  id TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),
  amount_received_minor INTEGER NOT NULL CHECK(amount_received_minor>=0),
  created INTEGER NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY(organization_id,livemode,id),
  FOREIGN KEY(organization_id,livemode,customer_id) REFERENCES billing_accounts(organization_id,livemode,customer_id)
);
CREATE INDEX billing_payments_page ON billing_payments(organization_id,livemode,created DESC,id DESC);
CREATE TABLE billing_subscriptions (
  organization_id TEXT NOT NULL,
  livemode INTEGER NOT NULL,
  customer_id TEXT NOT NULL,
  id TEXT NOT NULL,
  status TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL CHECK(cancel_at_period_end IN (0,1)),
  canceled_at INTEGER,
  created INTEGER NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY(organization_id,livemode,id),
  FOREIGN KEY(organization_id,livemode,customer_id) REFERENCES billing_accounts(organization_id,livemode,customer_id)
);
CREATE TABLE billing_webhook_receipts (
  organization_id TEXT NOT NULL,
  livemode INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY(organization_id,livemode,event_id),
  FOREIGN KEY(organization_id,livemode) REFERENCES billing_accounts(organization_id,livemode)
);
