-- A successful production OAuth tool call is evidence, never authorization.
-- Keep it outside the authority row: updating evidence must not revoke an
-- expert mandate or change any existing authentication/approval guard.
CREATE UNIQUE INDEX authorized_connections_tenant_identity ON authorized_connections(id,organization_id,user_id);
CREATE TABLE connection_tool_observations (
  connection_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  authorization_revision INTEGER NOT NULL DEFAULT 0 CHECK(authorization_revision>=0),
  last_successful_tool_at TEXT,
  PRIMARY KEY(connection_id,organization_id,user_id),
  FOREIGN KEY(connection_id,organization_id,user_id) REFERENCES authorized_connections(id,organization_id,user_id) ON UPDATE CASCADE ON DELETE CASCADE
);
INSERT INTO connection_tool_observations(connection_id,organization_id,user_id) SELECT id,organization_id,user_id FROM authorized_connections;
CREATE TRIGGER connection_tool_observation_created AFTER INSERT ON authorized_connections
BEGIN
  INSERT INTO connection_tool_observations(connection_id,organization_id,user_id) VALUES(NEW.id,NEW.organization_id,NEW.user_id);
END;
-- Increment even when an association is renewed within the same millisecond.
-- A previously authenticated in-flight request cannot verify the new binding.
CREATE TRIGGER connection_tool_observation_invalidated AFTER UPDATE OF status,organization_id,user_id,issuer,client_id,not_before,updated_at ON authorized_connections
BEGIN
  UPDATE connection_tool_observations SET authorization_revision=authorization_revision+1,last_successful_tool_at=NULL WHERE connection_id=NEW.id AND organization_id=NEW.organization_id AND user_id=NEW.user_id;
END;
