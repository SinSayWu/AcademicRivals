/**
 * Category definitions.
 *
 * These live in the database so the group can edit them from the Categories
 * screen — this file only supplies the defaults used to seed an empty install.
 *
 * IMPORTANT: editing a category does NOT rewrite past weeks. Once a week is
 * locked its points are snapshotted into `week_scores`, so September's winner
 * stays September's winner even if you retune the weights in October.
 */

export type CategoryKind = "positive" | "penalty" | "target";

export type Category = {
  key: string;
  label: string;
  hint: string;
  kind: CategoryKind;
  /**
   * Points per hour, applied linearly with no ceiling. Negative for penalties.
   * Unused by `target`.
   */
  rate: number;
  /** `target` only: low edge of the full-points band, in minutes. */
  rangeLowMin: number;
  /** `target` only: high edge of the full-points band, in minutes. */
  rangeHighMin: number;
  /** `target` only: points awarded anywhere inside the band. */
  maxPoints: number;
  sortOrder: number;
  active: boolean;
};

export const DEFAULT_CATEGORIES: Category[] = [
  {
    key: "schoolwork",
    label: "Schoolwork",
    hint: "Homework, studying, problem sets. Focused time only.",
    kind: "positive",
    rate: 10,
    rangeLowMin: 0,
    rangeHighMin: 0,
    maxPoints: 0,
    sortOrder: 1,
    active: true,
  },
  {
    key: "projects",
    label: "Projects & ECs",
    hint: "Clubs, competitions, side projects, instrument practice.",
    kind: "positive",
    rate: 12,
    rangeLowMin: 0,
    rangeHighMin: 0,
    maxPoints: 0,
    sortOrder: 2,
    active: true,
  },
  {
    key: "exercise",
    label: "Exercise",
    hint: "Anything that gets your heart rate up.",
    kind: "positive",
    rate: 10,
    rangeLowMin: 0,
    rangeHighMin: 0,
    maxPoints: 0,
    sortOrder: 3,
    active: true,
  },
  {
    key: "reading",
    label: "Reading",
    hint: "Books and long-form. Feeds do not count.",
    kind: "positive",
    rate: 7.5,
    rangeLowMin: 0,
    rangeHighMin: 0,
    maxPoints: 0,
    sortOrder: 4,
    active: true,
  },
  {
    key: "screen",
    label: "Junk Screen Time",
    hint: "Social, YouTube, games. The honest one. Pull it from Screen Time.",
    kind: "penalty",
    rate: -10,
    rangeLowMin: 0,
    rangeHighMin: 0,
    maxPoints: 0,
    sortOrder: 5,
    active: true,
  },
  {
    key: "sleep",
    label: "Sleep",
    hint: "7 to 9 hours. Both too little and too much lose points.",
    kind: "target",
    rate: 0,
    rangeLowMin: 420,
    rangeHighMin: 540,
    maxPoints: 15,
    sortOrder: 6,
    active: true,
  },
];

/** How long after a day ends you can still edit it. Stops Sunday-night fiction. */
export const EDIT_GRACE_DAYS = 2;

/** Everyone shares one clock so "what day is it" is never ambiguous. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/New_York";
