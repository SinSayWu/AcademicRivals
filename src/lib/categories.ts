import { query, queryOne } from "./db";
import { DEFAULT_CATEGORIES, type Category, type CategoryKind } from "./config";

type Row = {
  key: string;
  label: string;
  hint: string;
  kind: CategoryKind;
  rate: string;
  soft_cap_min: number;
  hard_cap_min: number;
  target_min: number;
  tolerance_min: number;
  max_points: string;
  sort_order: number;
  active: boolean;
};

function toCategory(r: Row): Category {
  return {
    key: r.key,
    label: r.label,
    hint: r.hint,
    kind: r.kind,
    rate: Number(r.rate),
    softCapMin: r.soft_cap_min,
    hardCapMin: r.hard_cap_min,
    targetMin: r.target_min,
    toleranceMin: r.tolerance_min,
    maxPoints: Number(r.max_points),
    sortOrder: r.sort_order,
    active: r.active,
  };
}

const COLUMNS = `key, label, hint, kind, rate, soft_cap_min, hard_cap_min,
                 target_min, tolerance_min, max_points, sort_order, active`;

/** Seeds the defaults the first time the app runs against an empty database. */
async function seed(): Promise<void> {
  const existing = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM categories`,
  );
  if (Number(existing?.n ?? 0) > 0) return;

  for (const c of DEFAULT_CATEGORIES) {
    await query(
      `INSERT INTO categories (${COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (key) DO NOTHING`,
      [
        c.key, c.label, c.hint, c.kind, c.rate, c.softCapMin, c.hardCapMin,
        c.targetMin, c.toleranceMin, c.maxPoints, c.sortOrder, c.active,
      ],
    );
  }
}

/** Active categories, in display order. This is what logging and scoring use. */
export async function listCategories(): Promise<Category[]> {
  await seed();
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM categories WHERE active ORDER BY sort_order, key`,
  );
  return rows.map(toCategory);
}

/**
 * Every category including archived ones. Scoring a *past* week has to include
 * categories that have since been removed, or the numbers would shift.
 */
export async function listAllCategories(): Promise<Category[]> {
  await seed();
  const rows = await query<Row>(
    `SELECT ${COLUMNS} FROM categories ORDER BY active DESC, sort_order, key`,
  );
  return rows.map(toCategory);
}

export async function getCategory(key: string): Promise<Category | null> {
  const row = await queryOne<Row>(`SELECT ${COLUMNS} FROM categories WHERE key = $1`, [
    key,
  ]);
  return row ? toCategory(row) : null;
}

/** Turns a label into a stable key: "Music Practice" -> "music-practice". */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createCategory(c: Omit<Category, "sortOrder" | "active">) {
  const next = await queryOne<{ n: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories`,
  );
  await query(
    `INSERT INTO categories (${COLUMNS})
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)`,
    [
      c.key, c.label, c.hint, c.kind, c.rate, c.softCapMin, c.hardCapMin,
      c.targetMin, c.toleranceMin, c.maxPoints, next?.n ?? 1,
    ],
  );
}

export async function updateCategory(key: string, c: Omit<Category, "key" | "sortOrder" | "active">) {
  await query(
    `UPDATE categories SET label=$2, hint=$3, kind=$4, rate=$5, soft_cap_min=$6,
            hard_cap_min=$7, target_min=$8, tolerance_min=$9, max_points=$10
     WHERE key=$1`,
    [
      key, c.label, c.hint, c.kind, c.rate, c.softCapMin, c.hardCapMin,
      c.targetMin, c.toleranceMin, c.maxPoints,
    ],
  );
}

/**
 * Archives rather than drops. The hours people already logged against this
 * category stay in the database, and locked weeks keep their frozen scores.
 */
export async function archiveCategory(key: string): Promise<void> {
  await query(`UPDATE categories SET active = false WHERE key = $1`, [key]);
}

export async function restoreCategory(key: string): Promise<void> {
  await query(`UPDATE categories SET active = true WHERE key = $1`, [key]);
}

/** Permanently drops a category and every hour ever logged against it. */
export async function purgeCategory(key: string): Promise<void> {
  await query(`DELETE FROM entries WHERE category_key = $1`, [key]);
  await query(`DELETE FROM categories WHERE key = $1`, [key]);
}

export async function moveCategory(key: string, direction: -1 | 1): Promise<void> {
  const all = await listCategories();
  const i = all.findIndex((c) => c.key === key);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= all.length) return;
  // Renumber the whole list so ordering stays sane even if it started messy.
  const reordered = [...all];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  for (const [index, cat] of reordered.entries()) {
    await query(`UPDATE categories SET sort_order = $2 WHERE key = $1`, [
      cat.key,
      index + 1,
    ]);
  }
}
