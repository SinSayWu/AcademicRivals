"use client";

import { useState, useTransition } from "react";
import type { Category } from "@/lib/config";
import { scoreDay, type MinutesMap } from "@/lib/scoring";
import { formatMinutes, parseTime } from "@/lib/timeinput";

/**
 * Nudge size per category. Targets (sleep) move in half-hours because nobody
 * logs a 15-minute difference in how long they slept.
 */
function stepFor(cat: Category): number {
  return cat.kind === "target" ? 30 : 15;
}

function TimeField({
  cat,
  value,
  editable,
  onChange,
}: {
  cat: Category;
  value: number;
  editable: boolean;
  onChange: (minutes: number) => void;
}) {
  // While the field has focus we hold the raw string, so typing "7." or
  // clearing the box doesn't get stomped by a re-render.
  const [draft, setDraft] = useState<string | null>(null);
  const step = stepFor(cat);

  const commit = (raw: string) => {
    const parsed = parseTime(raw);
    setDraft(null);
    if (parsed !== null) onChange(Math.max(0, Math.min(24 * 60, parsed)));
  };

  return (
    <div className="stepper">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - step))}
        disabled={!editable || value === 0}
        aria-label={`Less ${cat.label}`}
      >
        −
      </button>
      <input
        className={`value ${value === 0 && draft === null ? "zero" : ""}`}
        type="text"
        inputMode="decimal"
        disabled={!editable}
        aria-label={`${cat.label} time`}
        value={draft ?? formatMinutes(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setDraft(value === 0 ? "" : String(value / 60));
          e.target.select();
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
        }}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(24 * 60, value + step))}
        disabled={!editable}
        aria-label={`More ${cat.label}`}
      >
        +
      </button>
    </div>
  );
}

export default function LogForm({
  categories,
  initial,
  editable,
  save,
}: {
  categories: Category[];
  initial: MinutesMap;
  editable: boolean;
  save: (minutes: MinutesMap) => Promise<void>;
}) {
  const [minutes, setMinutes] = useState<MinutesMap>(initial);
  const [saved, setSaved] = useState(true);
  const [pending, startTransition] = useTransition();

  const set = (key: string, next: number) => {
    setMinutes((prev) => ({ ...prev, [key]: next }));
    setSaved(false);
  };

  const onSave = () => {
    // Send every category, including zeroes — an explicit "0h screen time" is
    // a real claim, and without it the row would just stay missing.
    const payload = Object.fromEntries(categories.map((c) => [c.key, minutes[c.key] ?? 0]));
    startTransition(async () => {
      await save(payload);
      setSaved(true);
    });
  };

  const day = scoreDay(categories, minutes);
  const scored = day.categories.filter((c) => c.points !== 0);

  if (categories.length === 0) {
    return (
      <div className="empty">
        There are no categories to log yet.
        <br />
        Add some on the Categories screen and this page fills in.
      </div>
    );
  }

  return (
    <div className="split">
      <section>
        <div className="list">
          {categories.map((cat) => {
            const value = minutes[cat.key] ?? 0;
            const pts = day.categories.find((c) => c.key === cat.key)?.points ?? 0;
            return (
              <div className="row" key={cat.key}>
                <div className="info">
                  <div className="name">{cat.label}</div>
                  {cat.hint ? <div className="hint">{cat.hint}</div> : null}
                </div>
                <TimeField
                  cat={cat}
                  value={value}
                  editable={editable}
                  onChange={(next) => set(cat.key, next)}
                />
                <div className="rowpts">
                  {value > 0 ? (
                    <span className={`pts ${pts < 0 ? "neg" : "pos"}`}>
                      {pts > 0 ? "+" : ""}
                      {pts}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {editable ? (
          <p className="note">
            Click a number to type it exactly — &ldquo;7.5&rdquo;, &ldquo;7h30&rdquo;
            and &ldquo;45m&rdquo; all work.
          </p>
        ) : null}
      </section>

      <aside className="scorecard">
        <h2>{editable ? "Today" : "That day"}</h2>
        <div className="big">{day.total}</div>
        <div className="muted tiny">points</div>

        {scored.length > 0 ? (
          <div className="breakdown">
            {scored.map((c) => (
              <div className="bl" key={c.key}>
                <span className="muted">{c.label}</span>
                <span className={`pts ${c.points < 0 ? "neg" : "pos"}`}>
                  {c.points > 0 ? "+" : ""}
                  {c.points}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="breakdown muted tiny">Nothing logged yet.</div>
        )}

        {editable ? (
          <button
            className="primary block"
            onClick={onSave}
            disabled={pending || saved}
            type="button"
          >
            {pending ? "Saving…" : saved ? "Saved" : "Save day"}
          </button>
        ) : (
          <p className="note" style={{ marginTop: 0 }}>
            This day is locked. You can only edit the last 3 days — backfilling a
            whole week on Sunday night is how the numbers stop meaning anything.
          </p>
        )}
      </aside>
    </div>
  );
}
