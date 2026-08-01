"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category } from "@/lib/config";
import { scoreDay, type MinutesMap } from "@/lib/scoring";
import { formatMinutes, parseTime } from "@/lib/timeinput";

/**
 * How long a change sits before it is written. Long enough that holding the +
 * button is one save instead of forty, short enough that you never think about
 * it.
 */
const AUTOSAVE_MS = 700;

/** Backoff after a failed write, per consecutive failure. */
const RETRY_MS = 4000;
const MAX_RETRY_MS = 30000;

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
  const [saving, setSaving] = useState(false);
  const [failures, setFailures] = useState(0);

  const set = (key: string, next: number) => {
    setMinutes((prev) => ({ ...prev, [key]: next }));
  };

  // Every category goes in the payload, including zeroes — an explicit
  // "0h screen time" is a real claim, and without it the row stays missing.
  // Serialising it gives a cheap identity to compare and to queue.
  const payload = useMemo(
    () =>
      JSON.stringify(Object.fromEntries(categories.map((c) => [c.key, minutes[c.key] ?? 0]))),
    [categories, minutes],
  );

  // What the server is known to hold. Seeding it with the payload we mounted
  // with is what stops a fresh page from writing a row nobody asked for.
  const savedRef = useRef(payload);
  const dirty = payload !== savedRef.current;

  // The action is a fresh function object on every render of the page, so it
  // can't sit in an effect's dependencies without restarting the timer.
  const saveRef = useRef(save);
  saveRef.current = save;

  // Writes run one at a time and in order. Two of them racing could otherwise
  // land the older payload last and quietly undo a number.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const flush = useCallback((body: string) => {
    chain.current = chain.current.then(async () => {
      if (savedRef.current === body) return; // already landed while queued
      setSaving(true);
      try {
        await saveRef.current(JSON.parse(body) as MinutesMap);
        savedRef.current = body;
        setFailures(0);
      } catch {
        setFailures((n) => n + 1);
      } finally {
        setSaving(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!editable || !dirty) return;
    const delay = failures === 0 ? AUTOSAVE_MS : Math.min(MAX_RETRY_MS, RETRY_MS * failures);
    const t = setTimeout(() => flush(payload), delay);
    return () => clearTimeout(t);
  }, [editable, dirty, payload, failures, flush]);

  // Clicking a day arrow unmounts this form. Anything still sitting in the
  // debounce window has to go out now, not never — the request outlives the
  // component.
  const latest = useRef(payload);
  latest.current = payload;
  useEffect(() => {
    if (!editable) return;
    return () => {
      if (latest.current !== savedRef.current) flush(latest.current);
    };
  }, [editable, flush]);

  // Closing the tab mid-write is the one case nothing can rescue, so ask.
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

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
            and &ldquo;45m&rdquo; all work. Nothing needs saving; every change is
            written on its own.
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
          <div
            className={`savestate ${failures > 0 ? "bad" : saving || dirty ? "busy" : "ok"}`}
            aria-live="polite"
          >
            <i aria-hidden />
            <span>
              {failures > 0
                ? "Couldn’t save"
                : saving || dirty
                  ? "Saving…"
                  : "Saved"}
            </span>
            {failures > 0 ? (
              <button type="button" onClick={() => flush(payload)}>
                Retry
              </button>
            ) : null}
          </div>
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
