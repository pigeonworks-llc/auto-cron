-- auto-cron run history schema (Phase C 初版)。
-- 1 行 = 1 JobRun (oneshot 1 attempt or service 1 spawn)
CREATE TABLE IF NOT EXISTS job_runs (
  run_id TEXT PRIMARY KEY,           -- ULID, 26 文字
  job_id TEXT NOT NULL,               -- Job.name
  attempt INTEGER NOT NULL,           -- 1-indexed; oneshot retry / service restart の N 回目
  started_at INTEGER NOT NULL,        -- epoch ms
  finished_at INTEGER,                -- epoch ms or NULL (進行中 / blocked / queued)
  exit_code INTEGER,                  -- exit code or NULL (skipped / running)
  stdout TEXT NOT NULL DEFAULT '',    -- truncated tail (~64KB by app layer)
  stderr TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,                -- JobRunState (10 variants)
  error TEXT                          -- 1-line summary
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_id_started_at ON job_runs(job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_state ON job_runs(state);
