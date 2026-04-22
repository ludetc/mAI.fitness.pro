-- Workout plans: one active plan per user at a time. Prior plans are archived, not deleted,
-- so we can show history and potentially reason over it in later phases.
-- `data` is a JSON-serialised WorkoutPlan (schema in packages/shared/src/workouts.ts).
CREATE TABLE IF NOT EXISTS workout_plans (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  goal         TEXT,
  data         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_workout_plans_user_status ON workout_plans(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_plans_user_active
  ON workout_plans(user_id) WHERE status = 'active';
