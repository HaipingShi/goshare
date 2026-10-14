CREATE TABLE IF NOT EXISTS ai_daily_usage (
  scope TEXT NOT NULL,
  day TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  PRIMARY KEY (scope, day)
);
-- Preserve existing usage when upgrading; historical failures cannot be identified.
INSERT OR IGNORE INTO ai_daily_usage (scope, day, used)
SELECT scope, day, count FROM daily_usage WHERE scope LIKE 'ai:%';

CREATE TABLE IF NOT EXISTS ai_budget_usage (
  day TEXT PRIMARY KEY,
  spent_milli INTEGER NOT NULL DEFAULT 0 CHECK (spent_milli >= 0),
  reserved_milli INTEGER NOT NULL DEFAULT 0 CHECK (reserved_milli >= 0)
);
CREATE TABLE IF NOT EXISTS ai_requests (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  day TEXT NOT NULL,
  reserved_milli INTEGER NOT NULL,
  charged_milli INTEGER,
  succeeded INTEGER,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'finalizing', 'settled'))
);
CREATE INDEX IF NOT EXISTS ai_requests_day ON ai_requests(day);
