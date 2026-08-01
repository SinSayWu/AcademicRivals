import { query, queryOne } from "./db";
import { listCategories } from "./categories";
import type { Category } from "./config";
import { addDays, today, weekStart, type LocalDate } from "./dates";

/**
 * End-of-week vote on what each category is worth.
 *
 * Timing, which is the fiddly part:
 *
 *   Monday    week W ends and locks; a poll for W opens.
 *   Mon-Sun   everyone votes during week W+1.
 *   Monday    week W+1 locks; W's poll closes and the new rates take effect.
 *
 * Rates therefore only ever change at a week boundary. Applying a vote mid-week
 * would re-score hours people had already logged under the old numbers.
 */

export type Choice = -1 | 0 | 1;

/** −1 / 0 / +1 per category key. */
export type Ballot = Record<string, Choice>;

export type Tally = {
  key: string;
  label: string;
  kind: Category["kind"];
  /** Which field the vote moves: penalties and positives move the hourly rate,
   *  range categories move the points paid inside the range. */
  field: "rate" | "maxPoints";
  /** Always the positive magnitude, so "up" means "worth more" for penalties
   *  too — a harsher penalty rather than a smaller number. */
  before: number;
  after: number;
  up: number;
  down: number;
  keep: number;
  net: number;
};

export function fieldFor(cat: Category): "rate" | "maxPoints" {
  return cat.kind === "target" ? "maxPoints" : "rate";
}

/** The magnitude a vote moves, ignoring the sign a penalty carries. */
export function magnitudeOf(cat: Category): number {
  return fieldFor(cat) === "maxPoints" ? cat.maxPoints : Math.abs(cat.rate);
}

/** 15% of the current value, but never a change too small to notice. */
export function stepFor(magnitude: number): number {
  return Math.max(0.5, Math.round(magnitude * 0.15 * 2) / 2);
}

/**
 * Counts a set of ballots into a change per category. Pure, so the awkward
 * part of this feature is testable without a database.
 *
 * A simple net majority wins: more people wanting it worth more than worth
 * less moves it up one step, and vice versa. A tie changes nothing.
 */
export function tally(cats: Category[], ballots: Ballot[]): Tally[] {
  return cats.map((cat) => {
    let up = 0;
    let down = 0;
    let keep = 0;
    for (const ballot of ballots) {
      const choice = ballot[cat.key] ?? 0;
      if (choice > 0) up++;
      else if (choice < 0) down++;
      else keep++;
    }

    const net = up - down;
    const before = magnitudeOf(cat);
    const step = stepFor(before);
    // Never let a category fall to zero or below; at that point it stops
    // meaning anything and should be deleted instead.
    const after = net > 0 ? before + step : net < 0 ? Math.max(0.5, before - step) : before;

    return {
      key: cat.key,
      label: cat.label,
      kind: cat.kind,
      field: fieldFor(cat),
      before,
      after: Math.round(after * 100) / 100,
      up,
      down,
      keep,
      net,
    };
  });
}

// ------------------------------------------------------------------ storage

export type Poll = {
  weekStart: LocalDate;
  closedAt: string | null;
  results: Tally[] | null;
};

function toDate(v: unknown): LocalDate {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

/** Opens a poll for a week that has just locked. Idempotent. */
export async function openPoll(week: LocalDate): Promise<void> {
  await query(
    `INSERT INTO polls (week_start) VALUES ($1::date) ON CONFLICT (week_start) DO NOTHING`,
    [week],
  );
}

/** The poll people can currently vote in, if any. */
export async function getOpenPoll(): Promise<Poll | null> {
  const row = await queryOne<{ week_start: string }>(
    `SELECT week_start FROM polls WHERE closed_at IS NULL
     ORDER BY week_start DESC LIMIT 1`,
  );
  return row ? { weekStart: toDate(row.week_start), closedAt: null, results: null } : null;
}

export async function getBallot(week: LocalDate, userId: number): Promise<Ballot | null> {
  const rows = await query<{ category_key: string; choice: number }>(
    `SELECT category_key, choice FROM poll_votes
     WHERE week_start = $1::date AND user_id = $2`,
    [week, userId],
  );
  if (rows.length === 0) return null;
  return Object.fromEntries(rows.map((r) => [r.category_key, r.choice as Choice]));
}

export async function countVoters(week: LocalDate): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT COUNT(DISTINCT user_id)::text AS n FROM poll_votes WHERE week_start = $1::date`,
    [week],
  );
  return Number(row?.n ?? 0);
}

export async function saveBallot(
  week: LocalDate,
  userId: number,
  ballot: Ballot,
): Promise<void> {
  const keys = Object.keys(ballot);
  if (keys.length === 0) return;
  const values: unknown[] = [];
  const tuples = keys.map((key, i) => {
    values.push(week, userId, key, ballot[key]);
    const b = i * 4;
    return `($${b + 1}::date, $${b + 2}, $${b + 3}, $${b + 4})`;
  });
  await query(
    `INSERT INTO poll_votes (week_start, user_id, category_key, choice)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (week_start, user_id, category_key)
     DO UPDATE SET choice = EXCLUDED.choice`,
    values,
  );
}

async function allBallots(week: LocalDate): Promise<Ballot[]> {
  const rows = await query<{ user_id: number; category_key: string; choice: number }>(
    `SELECT user_id, category_key, choice FROM poll_votes WHERE week_start = $1::date`,
    [week],
  );
  const byUser = new Map<number, Ballot>();
  for (const r of rows) {
    const b = byUser.get(r.user_id) ?? {};
    b[r.category_key] = r.choice as Choice;
    byUser.set(r.user_id, b);
  }
  return [...byUser.values()];
}

/**
 * Closes any poll whose voting week has itself ended, applying the result.
 * Called on page load, same as week locking — no cron job to keep alive.
 */
export async function closeDuePolls(): Promise<void> {
  const rows = await query<{ week_start: string }>(
    `SELECT week_start FROM polls WHERE closed_at IS NULL ORDER BY week_start`,
  );
  const thisWeek = weekStart(today());

  for (const row of rows) {
    const week = toDate(row.week_start);
    // The poll opened at the start of week+1; it closes once week+1 is over.
    if (addDays(week, 7) >= thisWeek) continue;

    const cats = await listCategories();
    const ballots = await allBallots(week);
    const results = ballots.length > 0 ? tally(cats, ballots) : [];

    for (const t of results) {
      if (t.after === t.before) continue;
      const cat = cats.find((c) => c.key === t.key);
      if (!cat) continue;
      if (t.field === "maxPoints") {
        await query(`UPDATE categories SET max_points = $2 WHERE key = $1`, [t.key, t.after]);
      } else {
        // Restore the sign: a penalty stays negative.
        const signed = cat.kind === "penalty" ? -t.after : t.after;
        await query(`UPDATE categories SET rate = $2 WHERE key = $1`, [t.key, signed]);
      }
    }

    await query(
      `UPDATE polls SET closed_at = now(), results = $2 WHERE week_start = $1::date`,
      [week, JSON.stringify(results)],
    );
  }
}

/** The most recently closed poll, for showing what changed. */
export async function getLastResult(): Promise<Poll | null> {
  const row = await queryOne<{ week_start: string; closed_at: string; results: Tally[] }>(
    `SELECT week_start, closed_at::text, results FROM polls
     WHERE closed_at IS NOT NULL ORDER BY week_start DESC LIMIT 1`,
  );
  return row
    ? {
        weekStart: toDate(row.week_start),
        closedAt: row.closed_at,
        results: row.results ?? [],
      }
    : null;
}
