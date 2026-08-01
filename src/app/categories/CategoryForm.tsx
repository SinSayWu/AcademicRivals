"use client";

import Link from "next/link";
import { useState } from "react";
import type { Category, CategoryKind } from "@/lib/config";

/**
 * Which fields matter depends on the scoring type, so this is a client
 * component purely to swap the field set when you change the dropdown.
 */
export default function CategoryForm({
  category,
  action,
}: {
  category?: Category;
  action: (form: FormData) => Promise<void>;
}) {
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? "positive");
  const h = (min: number) => String(Math.round((min / 60) * 100) / 100);

  return (
    <form className="editform" action={action}>
      {category ? <input type="hidden" name="key" value={category.key} /> : null}

      <div className="grid2">
        <div>
          <label htmlFor="label">Name</label>
          <input
            id="label"
            name="label"
            className="field"
            defaultValue={category?.label ?? ""}
            placeholder="Music Practice"
            required
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="kind">Scoring type</label>
          <select
            id="kind"
            name="kind"
            className="field"
            value={kind}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
          >
            <option value="positive">Earns points</option>
            <option value="penalty">Loses points</option>
            <option value="target">Hits a range</option>
          </select>
        </div>
      </div>

      <div className="stack">
        <label htmlFor="hint">Description</label>
        <input
          id="hint"
          name="hint"
          className="field"
          defaultValue={category?.hint ?? ""}
          placeholder="What counts, and what doesn't."
        />
      </div>

      <div className="stack">
        {kind === "target" ? (
          <div className="grid3">
            <div>
              <label htmlFor="lowHours">Range from (h)</label>
              <input
                id="lowHours"
                name="lowHours"
                className="field"
                type="number"
                step="0.25"
                min="0"
                defaultValue={h(category?.rangeLowMin ?? 420)}
              />
            </div>
            <div>
              <label htmlFor="highHours">Range to (h)</label>
              <input
                id="highHours"
                name="highHours"
                className="field"
                type="number"
                step="0.25"
                min="0"
                defaultValue={h(category?.rangeHighMin ?? 540)}
              />
            </div>
            <div>
              <label htmlFor="maxPoints">Points inside range</label>
              <input
                id="maxPoints"
                name="maxPoints"
                className="field"
                type="number"
                step="1"
                min="0"
                defaultValue={String(category?.maxPoints ?? 15)}
              />
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="rate">
              {kind === "penalty" ? "Points lost per hour" : "Points per hour"}
            </label>
            <input
              id="rate"
              name="rate"
              className="field"
              type="number"
              step="0.5"
              min="0"
              defaultValue={String(Math.abs(category?.rate ?? 10))}
              style={{ maxWidth: 200 }}
            />
          </div>
        )}
      </div>

      <p className="note">
        {kind === "target"
          ? "Full points anywhere inside the range. Outside it, points fall away the further off you are, reaching zero once you're a full range-width past either edge."
          : `Every hour counts the same, with no ceiling — ${
              kind === "penalty" ? "ten hours costs ten times one hour" : "ten hours is worth ten times one hour"
            }.`}
      </p>

      <div className="formactions">
        <button className="primary" type="submit">
          {category ? "Save changes" : "Add category"}
        </button>
        <Link className="btn" href="/categories">
          Cancel
        </Link>
      </div>
    </form>
  );
}
