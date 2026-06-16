CREATE TABLE IF NOT EXISTS daily_usage (
  scope TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope, day)
);
