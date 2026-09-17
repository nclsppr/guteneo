-- Fictional local simulation data only. Never run against production.
INSERT OR IGNORE INTO organizations(id,name,mode,created_at) VALUES('org_atelier','Atelier Gutenberg · Simulation','simulation',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('org_studio','Studio Papier · Simulation','simulation',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO users(id,name,email,created_at) VALUES('user_atelier','Camille · Démonstration','camille@example.invalid',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('user_studio','Lou · Démonstration','lou@example.invalid',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO memberships(organization_id,user_id,role,created_at) VALUES('org_atelier','user_atelier','admin',strftime('%Y-%m-%dT%H:%M:%fZ','now')),('org_studio','user_studio','admin',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES
('sender_atelier_email','org_atelier','email','Atelier · Simulation','atelier@example.invalid','verified','simulation',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('sender_atelier_fax','org_atelier','fax','Fax · Simulation','SIMULATION — aucun numéro d’émission','verified','simulation',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('sender_atelier_postal','org_atelier','postal','Atelier · Simulation','SIMULATION — adresse de retour fictive','verified','simulation',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('sender_studio_email','org_studio','email','Studio · Simulation','studio@example.invalid','verified','simulation',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('sender_studio_fax','org_studio','fax','Fax · Simulation','SIMULATION — aucun numéro d’émission','verified','simulation',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('sender_studio_postal','org_studio','postal','Studio · Simulation','SIMULATION — adresse de retour fictive','verified','simulation',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) SELECT o.id,c.channel,strftime('%Y-%m','now'),100,50000,'EUR' FROM organizations o CROSS JOIN (SELECT 'fax' AS channel UNION ALL SELECT 'email' UNION ALL SELECT 'postal') c WHERE o.mode='simulation';
INSERT OR IGNORE INTO channel_controls(organization_id,channel,enabled) SELECT o.id,c.channel,1 FROM organizations o CROSS JOIN (SELECT 'fax' AS channel UNION ALL SELECT 'email' UNION ALL SELECT 'postal') c WHERE o.mode='simulation';
