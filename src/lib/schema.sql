-- Runs on every boot. Everything is IF NOT EXISTS, so it is safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  handle      TEXT NOT NULL UNIQUE,   -- lowercased name, used for login
  pin_hash    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Group-wide, editable from the Categories screen. Seeded from
-- DEFAULT_CATEGORIES the first time the app boots against an empty database.
CREATE TABLE IF NOT EXISTS categories (
  key            TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  hint           TEXT NOT NULL DEFAULT '',
  kind           TEXT NOT NULL CHECK (kind IN ('positive', 'penalty', 'target')),
  rate           NUMERIC(7,2) NOT NULL DEFAULT 0,
  soft_cap_min   INTEGER NOT NULL DEFAULT 0,
  hard_cap_min   INTEGER NOT NULL DEFAULT 480,
  target_min     INTEGER NOT NULL DEFAULT 0,
  tolerance_min  INTEGER NOT NULL DEFAULT 0,
  max_points     NUMERIC(7,2) NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  -- Removing a category archives it rather than dropping the row, so the
  -- hours people already logged against it aren't silently deleted.
  active         BOOLEAN NOT NULL DEFAULT true
);

-- One row per person per category per day, upserted. Not an append-only log:
-- editing "today's schoolwork" should overwrite, not accumulate.
CREATE TABLE IF NOT EXISTS entries (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_key  TEXT NOT NULL,
  local_date    DATE NOT NULL,
  minutes       INTEGER NOT NULL CHECK (minutes >= 0 AND minutes <= 1440),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_key, local_date)
);

CREATE INDEX IF NOT EXISTS entries_by_date ON entries (local_date);
CREATE INDEX IF NOT EXISTS entries_by_user_date ON entries (user_id, local_date);

-- Frozen results. Written once when a week closes so that retuning a category
-- can never rewrite who won a past week.
CREATE TABLE IF NOT EXISTS week_scores (
  week_start  DATE NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points      NUMERIC(8,1) NOT NULL,
  rank        INTEGER NOT NULL,
  breakdown   JSONB NOT NULL,
  locked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, user_id)
);
