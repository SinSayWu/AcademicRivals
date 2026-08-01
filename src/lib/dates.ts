import { APP_TIMEZONE, EDIT_GRACE_DAYS } from "./config";

/**
 * Dates in this app are plain "YYYY-MM-DD" strings in the group's timezone,
 * never timestamps. "Which day does this count for" is a human question, and
 * storing instants means an 11:40pm log lands on tomorrow in UTC.
 */
export type LocalDate = string;

/** Today, in the group's shared timezone. */
export function today(now: Date = new Date()): LocalDate {
  // en-CA formats as YYYY-MM-DD, which is exactly what we store.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Monday of the week containing `date`. Weeks run Monday to Sunday. */
export function weekStart(date: LocalDate): LocalDate {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(date, offset);
}

export function weekEnd(date: LocalDate): LocalDate {
  return addDays(weekStart(date), 6);
}

/** The seven dates of the week containing `date`, Monday first. */
export function weekDates(date: LocalDate): LocalDate[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * You can edit today and the last `EDIT_GRACE_DAYS` days, and nothing else.
 * Backfilling an entire week on Sunday night is how the numbers become fiction.
 */
export function isEditable(date: LocalDate, now: LocalDate = today()): boolean {
  const age = daysBetween(date, now);
  return age >= 0 && age <= EDIT_GRACE_DAYS;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function dayLabel(date: LocalDate): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return DAY_LABELS[dow === 0 ? 6 : dow - 1];
}

export function prettyDate(date: LocalDate): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function prettyRange(start: LocalDate, end: LocalDate): string {
  const fmt = (d: LocalDate) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }).format(new Date(`${d}T00:00:00Z`));
  return `${fmt(start)} – ${fmt(end)}`;
}
