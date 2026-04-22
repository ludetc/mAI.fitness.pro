-- Session logs: one row per started training session.
-- `session_index` is the index into the plan's weeklyTemplate.
-- `exercises` is a JSON-serialised ExerciseLog[] (see packages/shared/src/sessions.ts).
-- A session is "in progress" when completed_at IS NULL.
CREATE TABLE IF NOT EXISTS session_logs (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  plan_id        TEXT NOT NULL,
  session_index  INTEGER NOT NULL,
  session_title  TEXT NOT NULL,
  started_at     INTEGER NOT NULL,
  completed_at   INTEGER,
  exercises      TEXT NOT NULL,
  notes          TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES workout_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_session_logs_user_completed
  ON session_logs(user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_session_logs_user_started
  ON session_logs(user_id, started_at DESC);

-- At most one in-progress session per user at a time. Enforced at the DB layer so
-- a racing POST /sessions/start cannot create two.
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_logs_user_active
  ON session_logs(user_id) WHERE completed_at IS NULL;
