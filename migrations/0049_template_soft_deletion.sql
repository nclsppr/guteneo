-- Keep immutable versions, generated documents and job history after removal.
ALTER TABLE document_templates ADD COLUMN deleted_at TEXT;

CREATE TRIGGER document_templates_deleted_immutable
BEFORE UPDATE ON document_templates WHEN OLD.deleted_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'deleted template is immutable');
END;

CREATE TRIGGER document_templates_deleted_archived
BEFORE UPDATE ON document_templates WHEN NEW.deleted_at IS NOT NULL AND NEW.state <> 'archived'
BEGIN
  SELECT RAISE(ABORT, 'deleted template must be archived');
END;
