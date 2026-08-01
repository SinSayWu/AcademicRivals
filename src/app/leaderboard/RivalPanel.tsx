import Link from "next/link";
import type { WeekDetail } from "@/lib/data";
import { dayLabel, today } from "@/lib/dates";
import { formatMinutes } from "@/lib/timeinput";

/**
 * A rival's week, compact enough to sit beside the standings rather than
 * replacing them. The full-page version at /rivals/[handle] keeps the
 * week-by-week history.
 */
export default function RivalPanel({
  name,
  handle,
  rank,
  streak,
  detail,
}: {
  name: string;
  handle: string;
  rank?: number;
  streak: number;
  detail: WeekDetail;
}) {
  const now = today();
  const peak = Math.max(20, ...detail.dayTotals.map(Math.abs));
  const logged = detail.days.filter((d) => Object.keys(d).length > 0).length;
  const anything = logged > 0;

  return (
    <aside className="panel">
      <div className="panelhead">
        <div>
          <b>{name}</b>
          <div className="meta">
            {rank ? `Rank ${rank}` : "Unranked"} · {logged}/7 days
            {streak > 1 ? ` · ${streak} day streak` : ""}
          </div>
        </div>
        <div className="ptotal">{detail.breakdown.total}</div>
      </div>

      {!anything ? (
        <p className="note" style={{ marginTop: 0 }}>
          Nothing logged this week yet.
        </p>
      ) : (
        <>
          {/* Points per day. Bars go up for a good day, down for a net-negative
              one, so a week of screen time reads at a glance. */}
          <div className="daybars">
            {detail.dayTotals.map((t, i) => (
              <div className="daybar" key={detail.dates[i]}>
                <div className="track">
                  <i
                    className={t < 0 ? "neg" : ""}
                    style={{ height: `${Math.max(t === 0 ? 0 : 4, (Math.abs(t) / peak) * 100)}%` }}
                  />
                </div>
                <span className={detail.dates[i] === now ? "istoday" : ""}>
                  {dayLabel(detail.dates[i]).slice(0, 1)}
                </span>
                <em>{t === 0 ? "" : t}</em>
              </div>
            ))}
          </div>

          <table className="minigrid">
            <thead>
              <tr>
                {/* Needs .cat too: with table-layout:fixed the whole column
                    takes its width from the first row's cell. */}
                <th className="cat" />
                {detail.dates.map((d) => (
                  <th key={d} className={d === now ? "istoday" : ""}>
                    {dayLabel(d).slice(0, 1)}
                  </th>
                ))}
                <th className="tot">Pts</th>
              </tr>
            </thead>
            <tbody>
              {detail.categories.map((cat) => {
                const pts =
                  detail.breakdown.categories.find((c) => c.key === cat.key)?.points ?? 0;
                const mins =
                  detail.breakdown.categories.find((c) => c.key === cat.key)?.minutes ?? 0;
                if (mins === 0 && !cat.active) return null;
                return (
                  <tr key={cat.key}>
                    <th className="cat">{cat.label}</th>
                    {detail.days.map((day, i) => {
                      const m = day[cat.key] ?? 0;
                      return (
                        <td key={detail.dates[i]} className={m === 0 ? "zero" : undefined}>
                          {m === 0 ? "·" : formatMinutes(m)}
                        </td>
                      );
                    })}
                    <td className="tot">
                      <span className={`pts ${pts < 0 ? "neg" : "pos"}`}>
                        {pts > 0 ? "+" : ""}
                        {pts}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <Link className="btn block" href={`/rivals/${encodeURIComponent(handle)}`}>
        Full history →
      </Link>
    </aside>
  );
}
