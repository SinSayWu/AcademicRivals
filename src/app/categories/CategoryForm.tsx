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
            <option value="target">Hits a target</option>
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
              <label htmlFor="targetHours">Ideal hours</label>
              <input
                id="targetHours"
                name="targetHours"
                className="field"
                type="number"
                step="0.25"
                min="0.25"
                defaultValue={h(category?.targetMin ?? 480)}
              />
            </div>
            <div>
              <label htmlFor="toleranceHours">Allowed drift (±h)</label>
              <input
                id="toleranceHours"
                name="toleranceHours"
                className="field"
                type="number"
                step="0.25"
                min="0.25"
                defaultValue={h(category?.toleranceMin ?? 90)}
              />
            </div>
            <div>
              <label htmlFor="maxPoints">Points when on target</label>
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
          <div className="grid3">
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
              />
            </div>
            {kind === "positive" ? (
              <div>
                <label htmlFor="softCapHours">Full rate up to (h)</label>
                <input
                  id="softCapHours"
                  name="softCapHours"
                  className="field"
                  type="number"
                  step="0.25"
                  min="0"
                  defaultValue={h(category?.softCapMin ?? 240)}
                />
              </div>
            ) : null}
            <div>
              <label htmlFor="hardCapHours">Stop counting after (h)</label>
              <input
                id="hardCapHours"
                name="hardCapHours"
                className="field"
                type="number"
                step="0.25"
                min="0.25"
                defaultValue={h(category?.hardCapMin ?? 480)}
              />
            </div>
          </div>
        )}
      </div>

      <p className="note">
        {kind === "positive"
          ? "Hours past the full rate are worth half, and hours past the hard cap are worth nothing. That rewards consistency over bingeing and makes exaggeration pointless."
          : kind === "penalty"
            ? "Every hour costs the same until the hard cap, which stops one bad Saturday putting someone in a hole they can't climb out of."
            : "Full points anywhere inside the drift, falling to zero at twice the drift. Both too little and too much lose points."}
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
