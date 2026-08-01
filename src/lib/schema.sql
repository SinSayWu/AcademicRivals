-- Runs on every boot. Everything here must be safe to re-run.

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
  key             TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  hint            TEXT NOT NULL DEFAULT '',
  kind            TEXT NOT NULL CHECK (kind IN ('positive', 'penalty', 'target')),
  -- Points per hour, linear and uncapped. Negative for penalties.
  rate            NUMERIC(7,2) NOT NULL DEFAULT 0,
  -- 'target' only: the full-points band, and what it pays inside it.
  range_low_min   INTEGER NOT NULL DEFAULT 0,
  range_high_min  INTEGER NOT NULL DEFAULT 0,
  max_points      NUMERIC(7,2) NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  -- Removing a category archives it rather than dropping the row, so the
  -- hours people already logged against it aren't silently deleted.
  active          BOOLEAN NOT NULL DEFAULT true
);

-- Migration off the original capped model. Caps were removed, and target
-- categories moved from "ideal +/- drift" to an explicit low/high band.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS range_low_min INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS range_high_min INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'categories'
      AND column_name = 'target_min'
  ) THEN
    -- Carry the old band over so a custom target category keeps its meaning.
    UPDATE categories
       SET range_low_min = GREATEST(target_min - tolerance_min, 0),
           range_high_min = target_min + tolerance_min
     WHERE kind = 'target'
       AND range_low_min = 0
       AND range_high_min = 0;

    -- The old Sleep default was 8h +/- 1.5h. If nobody has touched it, move it
    -- to the requested 7-9h band rather than leaving it at 6.5-9.5h.
    UPDATE categories
       SET range_low_min = 420, range_high_min = 540
     WHERE key = 'sleep' AND range_low_min = 390 AND range_high_min = 570;

    ALTER TABLE categories DROP COLUMN target_min, DROP COLUMN tolerance_min;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'categories'
      AND column_name = 'soft_cap_min'
  ) THEN
    ALTER TABLE categories DROP COLUMN soft_cap_min;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'categories'
      AND column_name = 'hard_cap_min'
  ) THEN
    ALTER TABLE categories DROP COLUMN hard_cap_min;
  END IF;
END $$;

-- Seeded descriptions are stored per row, so changing DEFAULT_CATEGORIES does
-- not reach a database that has already been seeded. These two still described
-- caps and an 8h target, both of which are gone. Matching on the exact old text
-- means a description someone has edited themselves is left alone, and makes
-- these statements no-ops once they have run.
UPDATE categories SET hint = 'Anything that gets your heart rate up.'
 WHERE key = 'exercise'
   AND hint = 'High rate, low cap — this rewards showing up, not grinding.';

UPDATE categories SET hint = '7 to 9 hours. Both too little and too much lose points.'
 WHERE key = 'sleep'
   AND hint = 'Target 8h. Both too little and too much lose points.';

-- One row per person per category per day, upserted. Not an append-only log:
-- editing "today's schoolwork" should overwrite, not accumulate.
-- The 1440 check is physical, not a scoring cap: a day has 24 hours.
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

-- End-of-week vote on what each category is worth. One poll per completed
-- week; it opens when that week locks and closes a week later, so a rate
-- change only ever lands on a week boundary.
CREATE TABLE IF NOT EXISTS polls (
  week_start  DATE PRIMARY KEY,
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ,
  results     JSONB
);

CREATE TABLE IF NOT EXISTS poll_votes (
  week_start    DATE NOT NULL REFERENCES polls(week_start) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_key  TEXT NOT NULL,
  -- -1 worth less, 0 leave it, +1 worth more
  choice        SMALLINT NOT NULL CHECK (choice IN (-1, 0, 1)),
  PRIMARY KEY (week_start, user_id, category_key)
);

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
