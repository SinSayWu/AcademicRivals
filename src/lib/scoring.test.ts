import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CATEGORIES, type Category } from "./config";
import { currentStreak, rank, scoreCategory, scoreDay, scoreDays } from "./scoring";
import { isEditable, weekDates, weekStart } from "./dates";
import { formatMinutes, parseTime } from "./timeinput";

const CATS = DEFAULT_CATEGORIES;
const cat = (key: string) => CATS.find((c) => c.key === key)!;

test("positive categories pay full rate inside the soft cap", () => {
  assert.equal(scoreCategory(cat("schoolwork"), 240).points, 40);
  assert.equal(scoreCategory(cat("exercise"), 60).points, 20);
});

test("positive categories pay half rate past the soft cap", () => {
  // 8h schoolwork = 4h at full + 4h at half = 40 + 20
  assert.equal(scoreCategory(cat("schoolwork"), 480).points, 60);
});

test("the hard cap makes exaggeration worthless", () => {
  const capped = scoreCategory(cat("schoolwork"), 480).points;
  assert.equal(scoreCategory(cat("schoolwork"), 900).points, capped);
  assert.equal(scoreCategory(cat("schoolwork"), 1440).points, capped);
});

test("consistency beats bingeing", () => {
  // The whole point of the curve: four steady days must outscore one huge one.
  const steady = scoreDays(CATS, [
    { schoolwork: 240 },
    { schoolwork: 240 },
    { schoolwork: 240 },
    { schoolwork: 240 },
  ]).total;
  const binge = scoreDays(CATS, [{ schoolwork: 960 }, {}, {}, {}]).total;
  assert.equal(steady, 160);
  assert.equal(binge, 60);
  assert.ok(steady > binge);
});

test("screen time subtracts, linearly and without mercy", () => {
  assert.equal(scoreCategory(cat("screen"), 120).points, -20);
  assert.equal(scoreCategory(cat("screen"), 240).points, -40);
  // Capped so one awful Saturday can't put you in an unrecoverable hole.
  assert.equal(scoreCategory(cat("screen"), 900).points, -80);
});

test("sleep scores a band, not a maximum", () => {
  assert.equal(scoreCategory(cat("sleep"), 480).points, 15); // 8h, ideal
  assert.equal(scoreCategory(cat("sleep"), 390).points, 15); // 6.5h, edge of band
  assert.equal(scoreCategory(cat("sleep"), 570).points, 15); // 9.5h, edge of band
  assert.equal(scoreCategory(cat("sleep"), 300).points, 0); // 5h, too little
  assert.equal(scoreCategory(cat("sleep"), 660).points, 0); // 11h, too much
});

test("an unlogged sleep day is neutral, not a zero-hour night", () => {
  assert.equal(scoreCategory(cat("sleep"), 0).points, 0);
  assert.equal(scoreDay(CATS, { schoolwork: 240 }).total, 40);
});

test("a realistic good day lands near 100", () => {
  const day = scoreDay(CATS, {
    schoolwork: 300,
    projects: 120,
    exercise: 45,
    reading: 30,
    screen: 90,
    sleep: 465,
  });
  assert.ok(day.total > 80 && day.total < 120, `got ${day.total}`);
});

// ------------------------------------------------- user-defined categories

/** A category built the way the Categories screen builds one. */
function custom(over: Partial<Category>): Category {
  return {
    key: "custom",
    label: "Custom",
    hint: "",
    kind: "positive",
    rate: 10,
    softCapMin: 0,
    hardCapMin: 480,
    targetMin: 0,
    toleranceMin: 0,
    maxPoints: 0,
    sortOrder: 99,
    active: true,
    ...over,
  };
}

test("a soft cap of zero means a flat rate with no curve", () => {
  // The Categories form leaves softCap at 0 for penalties, and a user can do
  // the same for a positive category. That must mean "no half-rate tier",
  // not "everything is half rate".
  const flat = custom({ rate: 10, softCapMin: 0, hardCapMin: 600 });
  assert.equal(scoreCategory(flat, 60).points, 10);
  assert.equal(scoreCategory(flat, 600).points, 100);
});

test("a user-defined category scores alongside the built-ins", () => {
  const cats = [cat("schoolwork"), custom({ key: "music", label: "Music", rate: 20, softCapMin: 60, hardCapMin: 120 })];
  const day = scoreDay(cats, { schoolwork: 120, music: 90 });
  // 2h schoolwork = 20, 1.5h music = 20 + (30min at half rate) = 20 + 5
  assert.equal(day.total, 45);
});

test("scoring only counts the categories it is given", () => {
  // Archived categories are excluded from *logging* but included when scoring
  // history, so the caller decides — the scorer must not assume a global list.
  const day = scoreDay([cat("schoolwork")], { schoolwork: 240, screen: 480 });
  assert.equal(day.total, 40);
  assert.equal(day.categories.length, 1);
});

test("a target category with no tolerance scores nothing rather than dividing by zero", () => {
  const broken = custom({ kind: "target", targetMin: 480, toleranceMin: 0, maxPoints: 15 });
  assert.equal(scoreCategory(broken, 480).points, 0);
});

// ------------------------------------------------------------------ ranking

test("ties share a rank", () => {
  const ranked = rank([
    { name: "a", points: 100 },
    { name: "b", points: 90 },
    { name: "c", points: 90 },
    { name: "d", points: 50 },
  ]);
  assert.deepEqual(
    ranked.map((r) => r.rank),
    [1, 2, 2, 4],
  );
});

test("streaks survive a day you haven't logged yet", () => {
  const logged = new Set(["2026-07-28", "2026-07-29", "2026-07-30"]);
  // Today is the 31st and unlogged — yesterday's streak should still stand.
  assert.equal(currentStreak(logged, "2026-07-31"), 3);
  logged.add("2026-07-31");
  assert.equal(currentStreak(logged, "2026-07-31"), 4);
  // A real gap ends it.
  assert.equal(currentStreak(new Set(["2026-07-28"]), "2026-07-31"), 0);
});

test("weeks run Monday to Sunday", () => {
  assert.equal(weekStart("2026-07-31"), "2026-07-27"); // Friday -> Monday
  assert.equal(weekStart("2026-07-27"), "2026-07-27"); // Monday -> itself
  assert.equal(weekStart("2026-08-02"), "2026-07-27"); // Sunday -> same week
  assert.equal(weekDates("2026-07-31").length, 7);
  assert.equal(weekDates("2026-07-31")[0], "2026-07-27");
  assert.equal(weekDates("2026-07-31")[6], "2026-08-02");
});

test("the time field parses what people actually type", () => {
  assert.equal(parseTime("7"), 420); // bare number = hours
  assert.equal(parseTime("7.5"), 450);
  assert.equal(parseTime("7h"), 420);
  assert.equal(parseTime("7h30"), 450);
  assert.equal(parseTime("7:30"), 450);
  assert.equal(parseTime("45m"), 45);
  assert.equal(parseTime("90"), 90); // above 24, so obviously minutes
  assert.equal(parseTime(" 7H30M "), 450); // sloppy input still works
  assert.equal(parseTime(""), 0); // clearing the box means zero
  assert.equal(parseTime("abc"), null); // rejected, leaves the value alone
});

test("typing a value and reading it back round-trips", () => {
  for (const input of ["7", "7.5", "0.25", "45m", "12h15"]) {
    const mins = parseTime(input)!;
    assert.equal(parseTime(formatMinutes(mins)), mins, `round-trip failed for ${input}`);
  }
});

test("the edit window closes after the grace period", () => {
  assert.ok(isEditable("2026-07-31", "2026-07-31")); // today
  assert.ok(isEditable("2026-07-29", "2026-07-31")); // 2 days back
  assert.ok(!isEditable("2026-07-28", "2026-07-31")); // 3 days back, frozen
  assert.ok(!isEditable("2026-08-01", "2026-07-31")); // no logging the future
});
