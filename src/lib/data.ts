import { query, queryOne } from "./db";
import { listAllCategories, listCategories } from "./categories";
import { addDays, today, weekDates, weekStart, type LocalDate } from "./dates";
import {
  currentStreak,
  rank,
  scoreDays,
  type Breakdown,
  type MinutesMap,
} from "./scoring";

type EntryRow = { user_id: number; category_key: string; local_date: string; minutes: number };
type UserRow = { id: number; name: string; handle: string };

/** pg returns DATE columns as JS Date objects; we want our plain string form. */
function toLocalDate(value: unknown): LocalDate {
  if (value instanceof Date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  }
  return String(value).slice(0, 10);
}

export async function listUsers(): Promise<UserRow[]> {
  return query<UserRow>(`SELECT id, name, handle FROM users ORDER BY name`);
}

export async function saveEntries(
  userId: number,
  date: LocalDate,
  minutes: MinutesMap,
): Promise<void> {
  const keys = Object.keys(minutes);
  if (keys.length === 0) return;

  // One statement, so a partial network failure can't leave half a day saved.
  const values: unknown[] = [];
  const tuples = keys.map((key, i) => {
    values.push(userId, key, date, minutes[key]);
    const b = i * 4;
    return `($${b + 1}, $${b + 2}, $${b + 3}::date, $${b + 4})`;
  });

  await query(
    `INSERT INTO entries (user_id, category_key, local_date, minutes)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (user_id, category_key, local_date)
     DO UPDATE SET minutes = EXCLUDED.minutes, updated_at = now()`,
    values,
  );
}

export async function getDay(userId: number, date: LocalDate): Promise<MinutesMap> {
  const rows = await query<EntryRow>(
    `SELECT category_key, minutes FROM entries
     WHERE user_id = $1 AND local_date = $2::date`,
    [userId, date],
  );
  return Object.fromEntries(rows.map((r) => [r.category_key, r.minutes]));
}

/** Every entry in a date range, grouped user -> date -> category -> minutes. */
async function getRange(
  from: LocalDate,
  to: LocalDate,
): Promise<Map<number, Map<LocalDate, MinutesMap>>> {
  const rows = await query<EntryRow>(
    `SELECT user_id, category_key, local_date, minutes FROM entries
     WHERE local_date >= $1::date AND local_date <= $2::date`,
    [from, to],
  );

  const byUser = new Map<number, Map<LocalDate, MinutesMap>>();
  for (const row of rows) {
    const date = toLocalDate(row.local_date);
    let days = byUser.get(row.user_id);
    if (!days) byUser.set(row.user_id, (days = new Map()));
    const day = days.get(date) ?? {};
    day[row.category_key] = row.minutes;
    days.set(date, day);
  }
  return byUser;
}

export type LeaderRow = {
  userId: number;
  name: string;
  handle: string;
  points: number;
  rank: number;
  streak: number;
  daysLogged: number;
  breakdown: Breakdown;
  /** Points per day, Monday first — drives the sparkline. */
  daily: number[];
};

/**
 * Live standings for a week. Recomputed on every request from raw entries, so
 * the table moves the moment someone logs. Past weeks come from `week_scores`
 * instead (see getLockedWeek) so history can't be rewritten by a category edit.
 *
 * Scoring uses *all* categories including archived ones — removing a category
 * mid-week shouldn't retroactively wipe the hours already logged against it.
 */
export async function getWeek(anyDateInWeek: LocalDate): Promise<LeaderRow[]> {
  const dates = weekDates(anyDateInWeek);
  const [users, byUser, streaks, cats] = await Promise.all([
    listUsers(),
    getRange(dates[0], dates[6]),
    getStreaks(),
    listAllCategories(),
  ]);

  const rows = users.map((u) => {
    const days = byUser.get(u.id) ?? new Map<LocalDate, MinutesMap>();
    const dayMaps = dates.map((d) => days.get(d) ?? {});
    const breakdown = scoreDays(cats, dayMaps);
    return {
      userId: u.id,
      name: u.name,
      handle: u.handle,
      points: breakdown.total,
      streak: streaks.get(u.id) ?? 0,
      daysLogged: dayMaps.filter((d) => Object.keys(d).length > 0).length,
      breakdown,
      daily: dayMaps.map((d) => scoreDays(cats, [d]).total),
    };
  });

  return rank(rows);
}

export async function getStreaks(): Promise<Map<number, number>> {
  const rows = await query<{ user_id: number; local_date: string }>(
    `SELECT DISTINCT user_id, local_date FROM entries
     WHERE local_date > now()::date - INTERVAL '120 days'`,
  );

  const byUser = new Map<number, Set<string>>();
  for (const row of rows) {
    const set = byUser.get(row.user_id) ?? new Set<string>();
    set.add(toLocalDate(row.local_date));
    byUser.set(row.user_id, set);
  }

  const now = today();
  return new Map([...byUser].map(([id, dates]) => [id, currentStreak(dates, now)]));
}

/**
 * A rival's own trailing average, for the Most Improved award. Ranking only on
 * raw points means whoever has the lightest course load wins every week and
 * everyone else stops logging by October.
 */
export async function getImprovement(
  currentWeek: LocalDate,
  weeksBack = 4,
): Promise<Map<number, number>> {
  const start = addDays(weekStart(currentWeek), -7 * weeksBack);
  const end = addDays(weekStart(currentWeek), -1);

  const rows = await query<{ user_id: number; avg: string }>(
    `SELECT user_id, AVG(points)::text AS avg FROM week_scores
     WHERE week_start >= $1::date AND week_start <= $2::date
     GROUP BY user_id`,
    [start, end],
  );

  return new Map(rows.map((r) => [r.user_id, Number(r.avg)]));
}

export type SeasonRow = {
  userId: number;
  name: string;
  leaguePoints: number;
  wins: number;
  weeksPlayed: number;
  totalPoints: number;
};

/**
 * Season table. Weekly finishes are worth 3/2/1 league points rather than
 * summing raw scores, so one catastrophic exam week doesn't end your season.
 */
export async function getSeason(): Promise<SeasonRow[]> {
  const rows = await query<{
    user_id: number;
    name: string;
    rank: number;
    points: string;
  }>(
    `SELECT ws.user_id, u.name, ws.rank, ws.points::text AS points
     FROM week_scores ws JOIN users u ON u.id = ws.user_id
     ORDER BY ws.week_start`,
  );

  const table = new Map<number, SeasonRow>();
  for (const row of rows) {
    const entry = table.get(row.user_id) ?? {
      userId: row.user_id,
      name: row.name,
      leaguePoints: 0,
      wins: 0,
      weeksPlayed: 0,
      totalPoints: 0,
    };
    entry.leaguePoints += row.rank === 1 ? 3 : row.rank === 2 ? 2 : row.rank === 3 ? 1 : 0;
    entry.wins += row.rank === 1 ? 1 : 0;
    entry.weeksPlayed += 1;
    entry.totalPoints += Number(row.points);
    table.set(row.user_id, entry);
  }

  return [...table.values()].sort(
    (a, b) => b.leaguePoints - a.leaguePoints || b.totalPoints - a.totalPoints,
  );
}

export async function getLockedWeeks(): Promise<LocalDate[]> {
  const rows = await query<{ week_start: string }>(
    `SELECT DISTINCT week_start FROM week_scores ORDER BY week_start DESC`,
  );
  return rows.map((r) => toLocalDate(r.week_start));
}

export async function getLockedWeek(week: LocalDate) {
  const rows = await query<{
    user_id: number;
    name: string;
    points: string;
    rank: number;
    breakdown: Breakdown;
  }>(
    `SELECT ws.user_id, u.name, ws.points::text AS points, ws.rank, ws.breakdown
     FROM week_scores ws JOIN users u ON u.id = ws.user_id
     WHERE ws.week_start = $1::date
     ORDER BY ws.rank`,
    [week],
  );
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    points: Number(r.points),
    rank: r.rank,
    breakdown: r.breakdown,
  }));
}

export async function isWeekLocked(week: LocalDate): Promise<boolean> {
  const row = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM week_scores WHERE week_start = $1::date`,
    [week],
  );
  return Number(row?.n ?? 0) > 0;
}

/**
 * Freeze a finished week into week_scores. Idempotent, and refuses to touch a
 * week that hasn't ended yet.
 */
export async function lockWeek(anyDateInWeek: LocalDate): Promise<boolean> {
  const start = weekStart(anyDateInWeek);
  const end = addDays(start, 6);
  if (end >= today()) return false;
  if (await isWeekLocked(start)) return false;

  const rows = await getWeek(start);
  for (const row of rows) {
    await query(
      `INSERT INTO week_scores (week_start, user_id, points, rank, breakdown)
       VALUES ($1::date, $2, $3, $4, $5)
       ON CONFLICT (week_start, user_id) DO NOTHING`,
      [start, row.userId, row.points, row.rank, JSON.stringify(row.breakdown)],
    );
  }
  return true;
}

/**
 * Locks every complete week that hasn't been locked yet. Called on page load,
 * which means no cron job to keep alive — the first person to open the app on
 * Monday closes out Sunday.
 */
export async function lockFinishedWeeks(): Promise<void> {
  const oldest = await queryOne<{ d: string | null }>(
    `SELECT MIN(local_date) AS d FROM entries`,
  );
  if (!oldest?.d) return;

  let cursor = weekStart(toLocalDate(oldest.d));
  const thisWeek = weekStart(today());
  while (cursor < thisWeek) {
    await lockWeek(cursor);
    cursor = addDays(cursor, 7);
  }
}

export { listCategories };
