import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getImprovement,
  getStreaks,
  getUserWeekDetail,
  getWeek,
  lockFinishedWeeks,
} from "@/lib/data";
import { listCategories } from "@/lib/categories";
import { prettyRange, today, weekEnd, weekStart } from "@/lib/dates";
import Shell from "../Shell";
import RivalPanel from "./RivalPanel";

export const dynamic = "force-dynamic";

type Search = Promise<{ rival?: string }>;

function Spark({ daily }: { daily: number[] }) {
  const peak = Math.max(20, ...daily.map(Math.abs));
  return (
    <div className="spark" aria-hidden>
      {daily.map((v, i) => (
        <i
          key={i}
          className={v === 0 ? "" : v < 0 ? "neg" : "on"}
          style={{ height: `${Math.max(5, (Math.abs(v) / peak) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // The first person to open the app on Monday closes out Sunday. No cron job
  // to keep alive, and the snapshot happens exactly once thanks to the PK.
  await lockFinishedWeeks();

  const now = today();
  const [rows, priorAverage, categories, streaks] = await Promise.all([
    getWeek(now),
    getImprovement(now),
    listCategories(),
    getStreaks(),
  ]);

  const anythingLogged = rows.some((r) => r.daysLogged > 0);

  // Whose week fills the side panel. Defaults to you, so the panel is never
  // empty on arrival.
  const { rival: wanted } = await searchParams;
  const selected =
    (wanted && rows.find((r) => r.handle === wanted.toLowerCase())) ||
    rows.find((r) => r.userId === session.userId) ||
    rows[0];
  const detail = selected ? await getUserWeekDetail(selected.userId, now) : null;

  // Most Improved is measured against your own trailing average, so the person
  // with the heaviest course load still has something to win.
  const improved = rows
    .map((r) => ({ row: r, base: priorAverage.get(r.userId) }))
    .filter((x) => x.base !== undefined && x.base! > 0)
    .map((x) => ({
      name: x.row.name,
      delta: Math.round(((x.row.points - x.base!) / x.base!) * 100),
    }))
    .sort((a, b) => b.delta - a.delta)[0];

  const mvps = categories
    .map((cat) => {
      const eligible = rows.filter((r) => r.daysLogged > 0);
      const best = [...eligible].sort((a, b) => {
        const am = a.breakdown.categories.find((c) => c.key === cat.key)?.minutes ?? 0;
        const bm = b.breakdown.categories.find((c) => c.key === cat.key)?.minutes ?? 0;
        // For penalties the winner is whoever logged the *least* — but only
        // among people who actually logged, so silence isn't a winning strategy.
        return cat.kind === "penalty" ? am - bm : bm - am;
      })[0];
      if (!best) return null;
      const mins = best.breakdown.categories.find((c) => c.key === cat.key)?.minutes ?? 0;
      if (cat.kind !== "penalty" && mins === 0) return null;
      return { label: cat.label, name: best.name, mins };
    })
    .filter(Boolean) as { label: string; name: string; mins: number }[];

  return (
    <Shell
      active="week"
      user={session.name}
      title="This week"
      subtitle={`${prettyRange(weekStart(now), weekEnd(now))} · standings freeze Sunday midnight`}
    >
      {!anythingLogged ? (
        <div className="empty">
          Nobody has logged anything yet this week.
          <br />
          Be the first and take an early lead.
        </div>
      ) : (
        <>
          <div className="withpanel">
            <section>
              <div className="list">
                {rows.map((r) => (
                  <Link
                    href={`/leaderboard?rival=${encodeURIComponent(r.handle)}`}
                    scroll={false}
                    key={r.userId}
                    className={`lb r${r.rank} ${r.userId === session.userId ? "me" : ""} ${
                      selected?.userId === r.userId ? "sel" : ""
                    }`}
                  >
                    <div className="rank">{r.rank}</div>
                    <div className="who">
                      <b>{r.name}</b>
                      <div className="meta">
                        {r.daysLogged}/7 days logged
                        {r.streak > 1 ? ` · ${r.streak} day streak` : ""}
                      </div>
                    </div>
                    <Spark daily={r.daily} />
                    <div className="score">{r.points}</div>
                  </Link>
                ))}
              </div>
              <p className="note">
                Pick anyone to see exactly what they logged, day by day.
              </p>
            </section>

            {selected && detail ? (
              <RivalPanel
                name={selected.name}
                handle={selected.handle}
                rank={selected.rank}
                streak={streaks.get(selected.userId) ?? 0}
                detail={detail}
              />
            ) : null}
          </div>

          <section className="cols2">
            <div>
              <h2>Most improved</h2>
              {improved ? (
                <>
                  <div className="bignum">
                    {improved.name}{" "}
                    <span className={improved.delta >= 0 ? "pts pos" : "pts neg"}>
                      {improved.delta >= 0 ? "+" : ""}
                      {improved.delta}%
                    </span>
                  </div>
                  <p className="note">
                    Measured against their own 4-week average, so the person with the
                    heaviest course load still has something to win.
                  </p>
                </>
              ) : (
                <p className="note" style={{ marginTop: 0 }}>
                  Needs a few finished weeks of history before this means anything.
                </p>
              )}
            </div>

            <div>
              <h2>Category leaders</h2>
              {mvps.length > 0 ? (
                <div className="list">
                  {mvps.map((m) => (
                    <div className="row" key={m.label}>
                      <div className="info">
                        <div className="name">{m.label}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <b>{m.name}</b>
                        <div className="hint">
                          {Math.floor(m.mins / 60)}h {m.mins % 60}m
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="note" style={{ marginTop: 0 }}>
                  No category has a leader yet.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}
