-- The preference belongs to the authenticated person, across their workspaces.
-- NULL preserves browser/device negotiation for accounts that have not chosen.
ALTER TABLE users ADD COLUMN preferred_locale TEXT
  CHECK(preferred_locale IS NULL OR preferred_locale IN ('fr','en','de','lb'));

-- Bind the chosen language to the same short-lived, single-use PKCE transaction.
-- Existing accounts are never overwritten by a later login's language hint.
ALTER TABLE auth_transactions ADD COLUMN preferred_locale TEXT
  CHECK(preferred_locale IS NULL OR preferred_locale IN ('fr','en','de','lb'));
