-- Window selection is per letter. Existing fingerprints and policy rows remain
-- immutable. Historical generations keep their original eight IDs; new complete
-- non-French generations qualify both windows using the same price calculator.
CREATE TABLE postal_setup_policy_generations_next(organization_id TEXT NOT NULL, generation INTEGER NOT NULL CHECK(generation>0), sender_id TEXT NOT NULL, policy_ids_json TEXT NOT NULL CHECK(json_valid(policy_ids_json) AND json_array_length(policy_ids_json) IN (8,16)), profile_json TEXT NOT NULL CHECK(json_valid(profile_json)), audit_id TEXT NOT NULL REFERENCES audit_log(id), created_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>created_at), PRIMARY KEY(organization_id,generation), FOREIGN KEY(organization_id,sender_id) REFERENCES postal_sender_declarations(organization_id,sender_id));
INSERT INTO postal_setup_policy_generations_next SELECT * FROM postal_setup_policy_generations;
DROP TABLE postal_setup_policy_generations;
ALTER TABLE postal_setup_policy_generations_next RENAME TO postal_setup_policy_generations;
CREATE TRIGGER immutable_postal_setup_policy_generation BEFORE UPDATE ON postal_setup_policy_generations BEGIN SELECT RAISE(ABORT,'immutable_postal_setup_policy_generation'); END;
CREATE TRIGGER retained_postal_setup_policy_generation BEFORE DELETE ON postal_setup_policy_generations BEGIN SELECT RAISE(ABORT,'immutable_postal_setup_policy_generation'); END;

-- Only expand complete, current self-service qualifications. Expired generations
-- retain their evidence and may use the existing explicit renewal operation.
-- Manual opposite-side qualifications/revocations are never superseded.
CREATE TABLE postal_window_expansion_candidates AS
SELECT g.* FROM postal_setup_policy_generations g
JOIN postal_sender_declarations d ON d.organization_id=g.organization_id AND d.sender_id=g.sender_id AND d.profile_json=g.profile_json
WHERE g.generation=(SELECT MAX(latest.generation) FROM postal_setup_policy_generations latest WHERE latest.organization_id=g.organization_id)
AND json_array_length(g.policy_ids_json)=8
AND json_extract(g.profile_json,'$.defaultCountry') IN ('LU','DE')
AND json_extract(g.profile_json,'$.addressPosition') IN ('left','right')
AND g.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
AND (SELECT COUNT(*) FROM trusted_delivery_costs p WHERE p.organization_id=g.organization_id AND p.sender_id=g.sender_id AND p.id IN (SELECT value FROM json_each(g.policy_ids_json)) AND p.channel='postal' AND p.provider='pingen' AND p.account_id=json_extract(g.profile_json,'$.accountId') AND p.route_id=p.account_id AND p.pricing_basis='public_list_price_ex_tax' AND p.source_reference='https://api.pingen.com/documentation/swagger-docs' AND json_extract(p.options_json,'$.addressPosition')=json_extract(g.profile_json,'$.addressPosition') AND p.expires_at=g.expires_at)=8
AND NOT EXISTS(SELECT 1 FROM trusted_delivery_costs p WHERE p.organization_id=g.organization_id AND p.sender_id=g.sender_id AND p.channel='postal' AND p.provider='pingen' AND p.account_id=json_extract(g.profile_json,'$.accountId') AND p.route_id=p.account_id AND json_extract(p.options_json,'$.addressPosition')<>json_extract(g.profile_json,'$.addressPosition'));

INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at,pricing_basis)
SELECT 'cost_window_'||p.id,p.organization_id,p.sender_id,p.channel,p.provider,p.account_id,p.route_id,json_set(p.options_json,'$.addressPosition',iif(json_extract(p.options_json,'$.addressPosition')='left','right','left')),p.rate_json,p.base_numerator,p.byte_numerator,p.rate_denominator,p.currency,p.fiscal_basis,p.quote_ttl_seconds,p.source_reference,p.source_sha256,p.valid_from,p.expires_at,p.status,p.created_at,p.pricing_basis
FROM postal_window_expansion_candidates g JOIN trusted_delivery_costs p ON p.organization_id=g.organization_id AND p.id IN (SELECT value FROM json_each(g.policy_ids_json));

INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at)
SELECT 'audit_windows_'||audit_id,organization_id,NULL,'postal.pricing.windows_extended',sender_id,'{"basis":"existing_qualified_calculator_policy","humanConsentClaimed":false,"priceDatesExtended":false}',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM postal_window_expansion_candidates;

INSERT INTO postal_setup_policy_generations(organization_id,generation,sender_id,policy_ids_json,profile_json,audit_id,created_at,expires_at)
SELECT g.organization_id,g.generation+1,g.sender_id,(SELECT json_group_array(policy_id) FROM (SELECT value AS policy_id FROM json_each(g.policy_ids_json) UNION ALL SELECT 'cost_window_'||value AS policy_id FROM json_each(g.policy_ids_json))),g.profile_json,'audit_windows_'||g.audit_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),g.expires_at FROM postal_window_expansion_candidates g;
DROP TABLE postal_window_expansion_candidates;
