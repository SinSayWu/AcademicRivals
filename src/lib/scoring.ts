import type { Category } from "./config";

/** Minutes logged, keyed by category. Missing key === zero. */
export type MinutesMap = Record<string, number>;

export type CategoryScore = {
  key: string;
  label: string;
  minutes: number;
  /** Minutes actually counted after the hard cap clamp. */
  countedMinutes: number;
  points: number;
};

export type Breakdown = {
  total: number;
  categories: CategoryScore[];
};

/**
 * Score one category for one day.
 *
 * Positive categories use a diminishing-returns curve: time inside the soft cap
 * earns the full rate, time beyond it earns half, and time beyond the hard cap
 * earns nothing. That makes a 12-hour library binge worth less than four solid
 * days, which is the behaviour we actually want to reward — and it makes lying
 * about your hours pointless past a certain number.
 */
export function scoreCategory(cat: Category, rawMinutes: number): CategoryScore {
  const minutes = Math.max(0, Math.round(rawMinutes || 0));
  const counted = Math.min(minutes, cat.hardCapMin);
  let points = 0;

  if (cat.kind === "positive" || cat.kind === "penalty") {
    // A soft cap of zero means "no curve" — every hour is worth the same,
    // which is what penalties want.
    const soft = cat.softCapMin > 0 ? cat.softCapMin : counted;
    const atFullRate = Math.min(counted, soft);
    const atHalfRate = Math.max(0, counted - soft);
    points = ((atFullRate + atHalfRate * 0.5) / 60) * cat.rate;
  } else {
    // Target band: full points inside the tolerance, decaying linearly to zero
    // at twice the tolerance. Logging nothing scores nothing rather than being
    // treated as "slept 0 hours", so an un-logged day is neutral, not punitive.
    if (minutes > 0 && cat.toleranceMin > 0) {
      const drift = Math.abs(counted - cat.targetMin);
      const over = Math.max(0, drift - cat.toleranceMin);
      const decay = Math.max(0, 1 - over / cat.toleranceMin);
      points = cat.maxPoints * decay;
    }
  }

  return {
    key: cat.key,
    label: cat.label,
    minutes,
    countedMinutes: counted,
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
 * Score a set of days. Days are scored independently and summed — this is what
 * makes the diminishing-returns curve bite. Summing the week's minutes first
 * and scoring once would let one huge day masquerade as a consistent week.
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
    countedMinutes: days.reduce(
      (sum, d) => sum + Math.min(d[cat.key] ?? 0, cat.hardCapMin),
      0,
    ),
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
  // Store the raw claim (clamping happens at score time) but refuse anything
  // physically impossible so a fat finger can't write 90000 into the table.
  return Math.min(Math.round(minutes), 24 * 60);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
