-- Preserve exact source and parser choices across explicit bounded recovery.
ALTER TABLE workflow_datasets ADD COLUMN parsing_options_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(parsing_options_json));
ALTER TABLE workflow_datasets ADD COLUMN analysis_attempts INTEGER NOT NULL DEFAULT 1 CHECK(analysis_attempts BETWEEN 0 AND 3);
ALTER TABLE workflow_datasets ADD COLUMN analysis_lease_token TEXT;
ALTER TABLE workflow_datasets ADD COLUMN analysis_lease_until TEXT;
CREATE TRIGGER immutable_dataset_parsing_options BEFORE UPDATE OF parsing_options_json ON workflow_datasets WHEN NEW.parsing_options_json<>OLD.parsing_options_json BEGIN SELECT RAISE(ABORT,'immutable_dataset_parsing_options'); END;
