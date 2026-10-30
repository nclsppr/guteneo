-- A person's web presentation follows their authenticated account across
-- workspaces. Existing and newly created accounts retain the classic interface.
-- This preference does not grant permissions or change any dispatch snapshot.
ALTER TABLE users ADD COLUMN preferred_dashboard_appearance TEXT NOT NULL
  DEFAULT 'classic' CHECK(preferred_dashboard_appearance IN ('classic','v2'));
