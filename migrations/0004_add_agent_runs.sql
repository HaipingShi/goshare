CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  page_id TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_created_at
  ON agent_runs (agent_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_created_at
  ON agent_runs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  data_json TEXT,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_logs_run_sequence
  ON agent_run_logs (run_id, sequence ASC);
