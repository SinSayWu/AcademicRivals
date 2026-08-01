import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listAllCategories } from "@/lib/categories";
import type { Category } from "@/lib/config";
import Shell from "../Shell";
import CategoryForm from "./CategoryForm";
import {
  archiveCategoryAction,
  createCategoryAction,
  moveCategoryAction,
  purgeCategoryAction,
  restoreCategoryAction,
  updateCategoryAction,
} from "./actions";

export const dynamic = "force-dynamic";

type Search = Promise<{ edit?: string; new?: string; error?: string }>;

/** Plain-English summary of how a category scores, shown under its name. */
function describe(c: Category): string {
  const h = (min: number) => `${Math.round((min / 60) * 100) / 100}h`;
  if (c.kind === "target") {
    return `${h(c.rangeLowMin)}–${h(c.rangeHighMin)} · ${c.maxPoints} pts inside the range`;
  }
  if (c.kind === "penalty") {
    return `−${Math.abs(c.rate)} pts per hour`;
  }
  return `${c.rate} pts per hour`;
}

export default async function CategoriesPage({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { edit, new: isNew, error } = await searchParams;
  const all = await listAllCategories();
  const active = all.filter((c) => c.active);
  const archived = all.filter((c) => !c.active);
  const editing = edit ? all.find((c) => c.key === edit) : undefined;

  return (
    <Shell
      active="categories"
      user={session.name}
      title="Categories"
      subtitle="What everyone logs, and how it scores. Changes apply to the whole group."
      actions={
        !isNew && !editing ? (
          <Link className="btn" href="/categories?new=1">
            New category
          </Link>
        ) : null
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {isNew ? <CategoryForm action={createCategoryAction} /> : null}

      <section>
        <div className="list">
          {active.map((c, i) =>
            editing?.key === c.key ? (
              <CategoryForm key={c.key} category={c} action={updateCategoryAction} />
            ) : (
              <div className="catrow" key={c.key}>
                <div className="info">
                  <div className="name">{c.label}</div>
                  <div className="rule">{describe(c)}</div>
                  {c.hint ? <div className="hint">{c.hint}</div> : null}
                </div>
                <div className="acts">
                  <form action={moveCategoryAction}>
                    <input type="hidden" name="key" value={c.key} />
                    <input type="hidden" name="dir" value="-1" />
                    <button className="btn icon" type="submit" disabled={i === 0} aria-label="Move up">
                      ↑
                    </button>
                  </form>
                  <form action={moveCategoryAction}>
                    <input type="hidden" name="key" value={c.key} />
                    <input type="hidden" name="dir" value="1" />
                    <button
                      className="btn icon"
                      type="submit"
                      disabled={i === active.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </form>
                  <Link className="btn" href={`/categories?edit=${c.key}`}>
                    Edit
                  </Link>
                  <form action={archiveCategoryAction}>
                    <input type="hidden" name="key" value={c.key} />
                    <button className="btn danger" type="submit">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ),
          )}
        </div>

        {active.length === 0 ? (
          <div className="empty">
            No categories yet — add one and people will have something to log.
          </div>
        ) : null}

        <p className="note">
          Hours are uncapped — every hour counts the same, however many you log.
          Deleting a category hides it from logging but keeps the hours already
          recorded against it, so past weeks keep their scores. Editing a category
          changes scoring from now on; weeks that have already closed are frozen
          and won&apos;t move.
        </p>
      </section>

      {archived.length > 0 ? (
        <section>
          <h2>Deleted</h2>
          <div className="list archived">
            {archived.map((c) => (
              <div className="catrow" key={c.key}>
                <div className="info">
                  <div className="name">{c.label}</div>
                  <div className="rule">{describe(c)}</div>
                </div>
                <div className="acts">
                  <form action={restoreCategoryAction}>
                    <input type="hidden" name="key" value={c.key} />
                    <button className="btn" type="submit">
                      Restore
                    </button>
                  </form>
                  <form action={purgeCategoryAction}>
                    <input type="hidden" name="key" value={c.key} />
                    <button className="btn danger" type="submit">
                      Erase for good
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          <p className="note">
            &ldquo;Erase for good&rdquo; also deletes every hour anyone ever logged
            against that category. It cannot be undone.
          </p>
        </section>
      ) : null}
    </Shell>
  );
}
