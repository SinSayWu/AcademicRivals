import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CATEGORIES, type Category } from "./config";
import { currentStreak, rank, scoreCategory, scoreDay, scoreDays } from "./scoring";
import { isEditable, weekDates, weekStart } from "./dates";
import { formatMinutes, parseTime } from "./timeinput";

const CATS = DEFAULT_CATEGORIES;
const cat = (key: string) => CATS.find((c) => c.key === key)!;

test("positive categories are linear at their rate", () => {
  assert.equal(scoreCategory(cat("schoolwork"), 60).points, 10);
  assert.equal(scoreCategory(cat("schoolwork"), 240).points, 40);
  assert.equal(scoreCategory(cat("exercise"), 60).points, 10);
  // A fractional rate still lands where arithmetic says it should.
  assert.equal(scoreCategory(cat("reading"), 120).points, 15);
  assert.equal(scoreCategory(cat("reading"), 60).points, 7.5);
});

test("nothing is capped — the tenth hour is worth as much as the first", () => {
  const one = scoreCategory(cat("schoolwork"), 60).points;
  assert.equal(scoreCategory(cat("schoolwork"), 600).points, one * 10);
  // Right up to the edge of a physically possible day.
  assert.equal(scoreCategory(cat("schoolwork"), 1440).points, 240);
});

test("a long day and several short ones now score the same", () => {
  // Caps and the diminishing-returns curve were removed by request, so the
  // scorer no longer prefers consistency. This test documents that on purpose:
  // if it ever fails, the curve came back.
  const steady = scoreDays(CATS, [
    { schoolwork: 240 },
    { schoolwork: 240 },
    { schoolwork: 240 },
    { schoolwork: 240 },
  ]).total;
  const binge = scoreDays(CATS, [{ schoolwork: 960 }, {}, {}, {}]).total;
  assert.equal(steady, 160);
  assert.equal(binge, 160);
});

test("screen time subtracts linearly and without a floor", () => {
  assert.equal(scoreCategory(cat("screen"), 120).points, -20);
  assert.equal(scoreCategory(cat("screen"), 240).points, -40);
  assert.equal(scoreCategory(cat("screen"), 900).points, -150);
});

test("sleep pays full points anywhere in 7-9 hours", () => {
  assert.equal(scoreCategory(cat("sleep"), 420).points, 15); // 7h, low edge
  assert.equal(scoreCategory(cat("sleep"), 480).points, 15); // 8h, middle
  assert.equal(scoreCategory(cat("sleep"), 540).points, 15); // 9h, high edge
});

test("sleep decays outside the range and bottoms out a range-width past it", () => {
  // The band is 2h wide, so the falloff is 2h: zero at 5h and at 11h.
  assert.equal(scoreCategory(cat("sleep"), 360).points, 7.5); // 6h, halfway down
  assert.equal(scoreCategory(cat("sleep"), 300).points, 0); // 5h
  assert.equal(scoreCategory(cat("sleep"), 240).points, 0); // 4h, no negatives
  assert.equal(scoreCategory(cat("sleep"), 600).points, 7.5); // 10h, halfway down
  assert.equal(scoreCategory(cat("sleep"), 660).points, 0); // 11h
});

test("an unlogged sleep day is neutral, not a zero-hour night", () => {
  assert.equal(scoreCategory(cat("sleep"), 0).points, 0);
  assert.equal(scoreDay(CATS, { schoolwork: 240 }).total, 40);
});

test("a realistic good day still lands near 100", () => {
  const day = scoreDay(CATS, {
    schoolwork: 300,
    projects: 120,
    exercise: 45,
    reading: 30,
    screen: 90,
    sleep: 465,
  });
  assert.ok(day.total > 80 && day.total < 130, `got ${day.total}`);
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
    rangeLowMin: 0,
    rangeHighMin: 0,
    maxPoints: 0,
    sortOrder: 99,
    active: true,
    ...over,
  };
}

test("a user-defined category scores alongside the built-ins", () => {
  const cats = [cat("schoolwork"), custom({ key: "music", label: "Music", rate: 20 })];
  const day = scoreDay(cats, { schoolwork: 120, music: 90 });
  assert.equal(day.total, 20 + 30);
});

test("scoring only counts the categories it is given", () => {
  // Archived categories are excluded from *logging* but included when scoring
  // history, so the caller decides — the scorer must not assume a global list.
  const day = scoreDay([cat("schoolwork")], { schoolwork: 240, screen: 480 });
  assert.equal(day.total, 40);
  assert.equal(day.categories.length, 1);
});

test("a backwards range is read as a range, not as nothing", () => {
  // Nothing stops someone typing 9 in the "from" box and 7 in the "to" box.
  const flipped = custom({ kind: "target", rangeLowMin: 540, rangeHighMin: 420, maxPoints: 15 });
  assert.equal(scoreCategory(flipped, 480).points, 15);
});

test("a zero-width range still has a usable falloff instead of a cliff", () => {
  // Exactly 8h and nothing else. Without a floor on the falloff, one minute
  // either side would wipe out every point.
  const exact = custom({ kind: "target", rangeLowMin: 480, rangeHighMin: 480, maxPoints: 10 });
  assert.equal(scoreCategory(exact, 480).points, 10);
  assert.equal(scoreCategory(exact, 510).points, 5); // 30min off, half credit
  assert.equal(scoreCategory(exact, 540).points, 0); // a full hour off
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
