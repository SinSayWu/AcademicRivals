/**
 * Parses what someone actually types into a time field: "7", "7.5", "7h",
 * "7h30", "7:30", "45m".
 *
 * Bare numbers are hours, because that's how people think about their day —
 * except a bare number above 24, which is obviously minutes. Returns null for
 * anything unparseable so the caller can leave the existing value alone rather
 * than silently zeroing someone's day.
 */
export function parseTime(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (s === "") return 0;

  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+(?:\.\d+)?)h(\d+)?m?$/))) {
    return Math.round(Number(m[1]) * 60 + Number(m[2] ?? 0));
  }
  if ((m = s.match(/^(\d+):(\d+)$/))) {
    return Number(m[1]) * 60 + Number(m[2]);
  }
  if ((m = s.match(/^(\d+(?:\.\d+)?)m$/))) {
    return Math.round(Number(m[1]));
  }
  if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) {
    const n = Number(m[1]);
    return Math.round(n > 24 ? n : n * 60);
  }
  return null;
}

/** Compact display: "0", "45m", "2h", "7h30". */
export function formatMinutes(min: number): string {
  if (min === 0) return "0";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}`;
}
