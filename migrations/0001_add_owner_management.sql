ALTER TABLE pages ADD COLUMN owner_key TEXT;
ALTER TABLE pages ADD COLUMN updated_at INTEGER;

UPDATE pages
SET updated_at = created_at
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pages_owner_updated_at ON pages (owner_key, updated_at DESC);
