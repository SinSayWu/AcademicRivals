import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getStreaks,
  getUserByHandle,
  getUserWeekDetail,
  getWeek,
} from "@/lib/data";
import {
  addDays,
  dayLabel,
  prettyRange,
  today,
  weekEnd,
  weekStart,
  type LocalDate,
} from "@/lib/dates";
import { formatMinutes } from "@/lib/timeinput";
import Shell from "../../Shell";

export const dynamic = "force-dynamic";

type Params = Promise<{ handle: string }>;
type Search = Promise<{ week?: string }>;

export default async function RivalPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Next already URL-decodes route params, so decoding again would corrupt a
  // name containing a literal '%' (and throw on a malformed one).
  const { handle } = await params;
  const rival = await getUserByHandle(handle.toLowerCase());
  if (!rival) notFound();

  const now = today();
  const { week: requested } = await searchParams;
  const valid = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested);
  // Never let someone page forward into a week that hasn't started.
  const start: LocalDate = valid
    ? weekStart(requested < now ? requested : now)
    : weekStart(now);
  const isThisWeek = start === weekStart(now);

  const [detail, standings, streaks] = await Promise.all([
    getUserWeekDetail(rival.id, start),
    getWeek(start),
    getStreaks(),
  ]);

  const place = standings.find((r) => r.userId === rival.id);
  const isMe = rival.id === session.userId;
  const prevWeek = addDays(start, -7);
  const nextWeek = addDays(start, 7);

  const pointsFor = (key: string) =>
    detail.breakdown.categories.find((c) => c.key === key)?.points ?? 0;
  const minutesFor = (key: string) =>
    detail.breakdown.categories.find((c) => c.key === key)?.minutes ?? 0;

  const anything = detail.days.some((d) => Object.keys(d).length > 0);

  return (
    <Shell
      active="week"
      user={session.name}
      title={isMe ? `${rival.name} (you)` : rival.name}
      subtitle={`${prettyRange(start, weekEnd(start))}${
        place ? ` · ${detail.breakdown.total} pts · rank ${place.rank} of ${standings.length}` : ""
      }${streaks.get(rival.id) ? ` · ${streaks.get(rival.id)} day streak` : ""}`}
      actions={
        <div className="daynav">
          <Link href={`/rivals/${encodeURIComponent(rival.handle)}?week=${prevWeek}`} aria-label="Previous week">
            ←
          </Link>
          {isThisWeek ? (
            <span className="disabled">→</span>
          ) : (
            <Link href={`/rivals/${encodeURIComponent(rival.handle)}?week=${nextWeek}`} aria-label="Next week">
              →
            </Link>
          )}
        </div>
      }
    >
      {!anything ? (
        <div className="empty">
          {isMe ? "You haven't" : `${rival.name} hasn't`} logged anything this week.
        </div>
      ) : (
        <section>
          <h2>Hours logged</h2>
          <div className="gridwrap">
            <table className="weekgrid">
              <thead>
                <tr>
                  <th className="cat">Category</th>
                  {detail.dates.map((d) => (
                    <th key={d} className={d === now ? "istoday" : ""}>
                      {dayLabel(d)}
                      <span>{Number(d.slice(8, 10))}</span>
                    </th>
                  ))}
                  <th className="tot">Total</th>
                  <th className="tot">Pts</th>
                </tr>
              </thead>
              <tbody>
                {detail.categories.map((cat) => {
                  const pts = pointsFor(cat.key);
                  return (
                    <tr key={cat.key}>
                      <td className="cat">
                        {cat.label}
                        {!cat.active ? <span className="gone"> deleted</span> : null}
                      </td>
                      {detail.days.map((day, i) => {
                        const mins = day[cat.key] ?? 0;
                        return (
                          <td
                            key={detail.dates[i]}
                            className={mins === 0 ? "zero" : undefined}
                          >
                            {mins === 0 ? "·" : formatMinutes(mins)}
                          </td>
                        );
                      })}
                      <td className="tot">{formatMinutes(minutesFor(cat.key))}</td>
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
              <tfoot>
                <tr>
                  <td className="cat">Points</td>
                  {detail.dayTotals.map((t, i) => (
                    <td key={detail.dates[i]} className={t === 0 ? "zero" : undefined}>
                      {t === 0 ? "·" : t}
                    </td>
                  ))}
                  <td className="tot" />
                  <td className="tot">
                    <b>{detail.breakdown.total}</b>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="note">
            Everyone can see everyone&apos;s hours. That&apos;s the point — a total
            nobody can inspect is just a number you have to take on trust.
          </p>
        </section>
      )}

      <section>
        <h2>Other rivals</h2>
        <div className="rivalpills">
          {standings.map((r) => (
            <Link
              key={r.userId}
              href={`/rivals/${encodeURIComponent(r.handle)}?week=${start}`}
              className={`pill ${r.userId === rival.id ? "on" : ""}`}
            >
              {r.name}
              <span>{r.points}</span>
            </Link>
          ))}
        </div>
      </section>
    </Shell>
  );
}
