"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  archiveCategory,
  createCategory,
  getCategory,
  moveCategory,
  purgeCategory,
  restoreCategory,
  slugify,
  updateCategory,
} from "@/lib/categories";
import type { CategoryKind } from "@/lib/config";

function refresh() {
  revalidatePath("/categories");
  revalidatePath("/");
  revalidatePath("/leaderboard");
}

async function requireSession() {
  const me = await getSession();
  if (!me) redirect("/login");
  return me;
}

function fail(msg: string): never {
  redirect(`/categories?error=${encodeURIComponent(msg)}`);
}

/** Pulls the shared numeric fields off the form and sanity-checks them. */
function readFields(form: FormData) {
  const label = String(form.get("label") ?? "").trim();
  const hint = String(form.get("hint") ?? "").trim();
  const kind = String(form.get("kind") ?? "positive") as CategoryKind;

  if (label.length < 2 || label.length > 40) fail("Name must be 2–40 characters.");
  if (!["positive", "penalty", "target"].includes(kind)) fail("Unknown category type.");

  const num = (name: string, fallback = 0) => {
    const raw = form.get(name);
    const n = Number(raw);
    return raw === null || raw === "" || !Number.isFinite(n) ? fallback : n;
  };

  const hours = (name: string, fallback = 0) => Math.round(num(name, fallback) * 60);

  if (kind === "target") {
    const rangeLowMin = hours("lowHours", 7);
    const rangeHighMin = hours("highHours", 9);
    if (rangeLowMin <= 0) fail("The bottom of the range must be more than zero.");
    if (rangeHighMin < rangeLowMin) fail("The top of the range can't be below the bottom.");
    if (rangeHighMin > 24 * 60) fail("A day only has 24 hours.");
    return {
      label, hint, kind,
      rate: 0,
      rangeLowMin,
      rangeHighMin,
      maxPoints: num("maxPoints", 15),
    };
  }

  // Penalties are stored negative; the form asks for a positive number because
  // "−10 points per hour" is easier to type as "10" under a "Penalty" label.
  const rate = Math.abs(num("rate", 10)) * (kind === "penalty" ? -1 : 1);

  return {
    label, hint, kind, rate,
    rangeLowMin: 0, rangeHighMin: 0, maxPoints: 0,
  };
}

export async function createCategoryAction(form: FormData) {
  await requireSession();
  const fields = readFields(form);

  const key = slugify(fields.label);
  if (!key) fail("That name doesn't produce a usable id — try letters and numbers.");
  if (await getCategory(key)) fail(`A category called "${fields.label}" already exists.`);

  await createCategory({ key, ...fields });
  refresh();
  redirect("/categories");
}

export async function updateCategoryAction(form: FormData) {
  await requireSession();
  const key = String(form.get("key") ?? "");
  if (!(await getCategory(key))) fail("That category no longer exists.");

  await updateCategory(key, readFields(form));
  refresh();
  redirect("/categories");
}

export async function archiveCategoryAction(form: FormData) {
  await requireSession();
  await archiveCategory(String(form.get("key") ?? ""));
  refresh();
  redirect("/categories");
}

export async function restoreCategoryAction(form: FormData) {
  await requireSession();
  await restoreCategory(String(form.get("key") ?? ""));
  refresh();
  redirect("/categories");
}

export async function purgeCategoryAction(form: FormData) {
  await requireSession();
  await purgeCategory(String(form.get("key") ?? ""));
  refresh();
  redirect("/categories");
}

export async function moveCategoryAction(form: FormData) {
  await requireSession();
  const dir = Number(form.get("dir")) === 1 ? 1 : -1;
  await moveCategory(String(form.get("key") ?? ""), dir);
  refresh();
  redirect("/categories");
}
