CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  password TEXT,
  is_protected INTEGER NOT NULL DEFAULT 0,
  code_type TEXT NOT NULL DEFAULT 'html',
  content_size INTEGER NOT NULL DEFAULT 0,
  content_sha256 TEXT
);

CREATE INDEX IF NOT EXISTS idx_pages_created_at ON pages (created_at DESC);
