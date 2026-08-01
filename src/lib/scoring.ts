import type { Category } from "./config";

/** Minutes logged, keyed by category. Missing key === zero. */
export type MinutesMap = Record<string, number>;

export type CategoryScore = {
  key: string;
  label: string;
  minutes: number;
  points: number;
};

export type Breakdown = {
  total: number;
  categories: CategoryScore[];
};

/** Falloff outside a target band is at least this wide, so a narrow band
 *  doesn't turn into a cliff where one minute costs every point. */
const MIN_FALLOFF_MIN = 60;

/**
 * Score one category for one day.
 *
 * `positive` and `penalty` are linear and uncapped: every hour is worth `rate`,
 * however many you log. `target` pays full points anywhere inside its band and
 * decays to zero as you get further outside it.
 */
export function scoreCategory(cat: Category, rawMinutes: number): CategoryScore {
  const minutes = Math.max(0, Math.round(rawMinutes || 0));
  let points = 0;

  if (cat.kind === "positive" || cat.kind === "penalty") {
    points = (minutes / 60) * cat.rate;
  } else if (minutes > 0) {
    // Logging nothing scores nothing rather than being treated as "slept 0
    // hours", so an un-logged day is neutral rather than punitive.
    const low = Math.min(cat.rangeLowMin, cat.rangeHighMin);
    const high = Math.max(cat.rangeLowMin, cat.rangeHighMin);
    const falloff = Math.max(high - low, MIN_FALLOFF_MIN);
    const outside = minutes < low ? low - minutes : minutes > high ? minutes - high : 0;
    points = cat.maxPoints * Math.max(0, 1 - outside / falloff);
  }

  return {
    key: cat.key,
    label: cat.label,
    minutes,
    points: round1(points),
  };
}

/** Score a single day across the given categories. */
export function scoreDay(cats: Category[], minutes: MinutesMap): Breakdown {
  const categories = cats.map((cat) => scoreCategory(cat, minutes[cat.key] ?? 0));
  return {
    total: round1(categories.reduce((sum, c) => sum + c.points, 0)),
    categories,
  };
}

/**
 * Score a set of days. Days are still scored independently and summed, which
 * matters for target categories — sleeping 8h every night should beat sleeping
 * 56h in one go, and summing the week's minutes first would call those equal.
 */
export function scoreDays(cats: Category[], days: MinutesMap[]): Breakdown {
  const totals = new Map<string, number>();
  let total = 0;

  for (const day of days) {
    const scored = scoreDay(cats, day);
    total += scored.total;
    for (const c of scored.categories) {
      totals.set(c.key, (totals.get(c.key) ?? 0) + c.points);
    }
  }

  const categories: CategoryScore[] = cats.map((cat) => ({
    key: cat.key,
    label: cat.label,
    minutes: days.reduce((sum, d) => sum + (d[cat.key] ?? 0), 0),
    points: round1(totals.get(cat.key) ?? 0),
  }));

  return { total: round1(total), categories };
}

/**
 * Turn scored members into a ranked table. Ties share a rank (1, 2, 2, 4) so a
 * genuine dead heat doesn't get broken by whatever order Postgres felt like.
 */
export function rank<T extends { points: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  let lastPoints = Number.NaN;
  let lastRank = 0;

  return sorted.map((row, i) => {
    if (row.points !== lastPoints) {
      lastRank = i + 1;
      lastPoints = row.points;
    }
    return { ...row, rank: lastRank };
  });
}

/** Longest run of consecutive logged days ending on `today`. */
export function currentStreak(loggedDates: Set<string>, today: string): number {
  let streak = 0;
  const cursor = new Date(`${today}T00:00:00Z`);

  // A day you haven't logged *yet* shouldn't break a streak, so if today is
  // missing we start counting from yesterday instead of returning zero.
  if (!loggedDates.has(today)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  while (loggedDates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function validateMinutes(
  cats: Category[],
  key: string,
  minutes: number,
): number | null {
  if (!cats.some((c) => c.key === key)) return null;
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  // There are no scoring caps any more, but a day still only has 24 hours —
  // this stops a fat finger writing 90000 into the table.
  return Math.min(Math.round(minutes), 24 * 60);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
