CREATE TABLE IF NOT EXISTS page_submissions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'submission',
  payload_json TEXT NOT NULL,
  submitter_key TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_page_submissions_page_created_at
  ON page_submissions (page_id, created_at DESC);
