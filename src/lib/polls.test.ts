import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CATEGORIES, type Category } from "./config";
import { magnitudeOf, stepFor, tally, type Ballot } from "./polls";

const cat = (key: string) => DEFAULT_CATEGORIES.find((c) => c.key === key)!;
const only = (key: string) => [cat(key)];
const find = (rows: ReturnType<typeof tally>, key: string) => rows.find((r) => r.key === key)!;

/** n ballots all voting the same way on one category. */
function votes(key: string, choices: (-1 | 0 | 1)[]): Ballot[] {
  return choices.map((c) => ({ [key]: c }));
}

test("a net majority for 'more' raises the rate by one step", () => {
  const r = find(tally(only("schoolwork"), votes("schoolwork", [1, 1, -1])), "schoolwork");
  assert.equal(r.before, 10);
  assert.equal(r.after, 11.5); // 15% of 10 = 1.5
  assert.equal(r.net, 1);
});

test("a net majority for 'less' lowers it by one step", () => {
  const r = find(tally(only("schoolwork"), votes("schoolwork", [-1, -1, 1])), "schoolwork");
  assert.equal(r.after, 8.5);
});

test("a tie changes nothing", () => {
  const r = find(tally(only("schoolwork"), votes("schoolwork", [1, -1])), "schoolwork");
  assert.equal(r.after, r.before);
  assert.equal(r.net, 0);
});

test("abstentions count as leaving it alone, not as a vote against", () => {
  const r = find(tally(only("schoolwork"), votes("schoolwork", [1, 0, 0, 0])), "schoolwork");
  assert.equal(r.up, 1);
  assert.equal(r.keep, 3);
  assert.equal(r.down, 0);
  assert.ok(r.after > r.before, "one lone yes with three abstentions still passes");
});

test("a missing answer on a ballot is an abstention, not a crash", () => {
  const r = find(tally(only("schoolwork"), [{}, { schoolwork: 1 }]), "schoolwork");
  assert.equal(r.keep, 1);
  assert.equal(r.up, 1);
});

test("no ballots at all leaves everything exactly as it was", () => {
  for (const row of tally(DEFAULT_CATEGORIES, [])) {
    assert.equal(row.after, row.before, `${row.key} moved with zero votes`);
    assert.equal(row.net, 0);
  }
});

test("the step is always big enough to notice", () => {
  // 15% of a small number rounds to nothing, so the step has a floor.
  assert.equal(stepFor(1), 0.5);
  assert.equal(stepFor(2), 0.5);
  assert.equal(stepFor(10), 1.5);
  assert.equal(stepFor(20), 3);
});

test("a category can never be voted down to zero or below", () => {
  const tiny: Category = { ...cat("schoolwork"), rate: 0.5 };
  const r = find(tally([tiny], votes("schoolwork", [-1, -1, -1])), "schoolwork");
  assert.equal(r.after, 0.5, "floors instead of going to zero or negative");
});

test("penalties are voted on by magnitude, so 'harsher' is an increase", () => {
  // Screen time is stored as -10. A vote to make it count for more should
  // raise the magnitude; restoring the sign is the caller's job.
  assert.equal(magnitudeOf(cat("screen")), 10);
  const r = find(tally(only("screen"), votes("screen", [1, 1])), "screen");
  assert.equal(r.field, "rate");
  assert.equal(r.before, 10);
  assert.equal(r.after, 11.5);
  assert.ok(r.after > 0, "the tally deals in magnitudes, never signed values");
});

test("range categories move their points, not a nonexistent hourly rate", () => {
  assert.equal(magnitudeOf(cat("sleep")), 15);
  const r = find(tally(only("sleep"), votes("sleep", [1, 1, 0])), "sleep");
  assert.equal(r.field, "maxPoints");
  assert.equal(r.before, 15);
  assert.equal(r.after, 17.5);
});

test("every category is tallied independently in one pass", () => {
  const ballots: Ballot[] = [
    { schoolwork: 1, screen: -1, sleep: 0 },
    { schoolwork: 1, screen: -1, sleep: 1 },
  ];
  const rows = tally(DEFAULT_CATEGORIES, ballots);
  assert.ok(find(rows, "schoolwork").after > 10);
  assert.ok(find(rows, "screen").after < 10, "voted softer, so the magnitude drops");
  assert.ok(find(rows, "sleep").after > 15);
  // Untouched categories stay put.
  assert.equal(find(rows, "reading").after, find(rows, "reading").before);
  assert.equal(rows.length, DEFAULT_CATEGORIES.length);
});

test("results are rounded to something a person would type", () => {
  for (const row of tally(DEFAULT_CATEGORIES, votes("schoolwork", [1]))) {
    assert.equal(row.after, Math.round(row.after * 100) / 100);
  }
});
