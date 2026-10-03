-- Cell coordinates and renderer identities, never copied customer values.
CREATE TABLE generation_record_provenance (
 organization_id TEXT NOT NULL, job_id TEXT NOT NULL, record_id TEXT NOT NULL,
 source_sha256 TEXT, provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)), render_metadata_json TEXT NOT NULL CHECK(json_valid(render_metadata_json)),
 PRIMARY KEY(organization_id,job_id,record_id), FOREIGN KEY(organization_id,job_id,record_id) REFERENCES generation_records(organization_id,job_id,record_id)
);
CREATE TRIGGER immutable_generation_provenance BEFORE UPDATE ON generation_record_provenance BEGIN SELECT RAISE(ABORT,'immutable_generation_provenance'); END;
