import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLockedWeek, getLockedWeeks, getSeason, lockFinishedWeeks } from "@/lib/data";
import { prettyRange, weekEnd } from "@/lib/dates";
import Shell from "../Shell";

export const dynamic = "force-dynamic";

export default async function SeasonPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  await lockFinishedWeeks();

  const [table, weeks] = await Promise.all([getSeason(), getLockedWeeks()]);
  const recent = await Promise.all(
    weeks.slice(0, 6).map(async (w) => ({ week: w, rows: await getLockedWeek(w) })),
  );

  return (
    <Shell
      active="season"
      user={session.name}
      title="Season"
      subtitle="3 league points for a weekly win, 2 for second, 1 for third"
    >
      {table.length === 0 ? (
        <div className="empty">
          No weeks have finished yet.
          <br />
          The first season standings appear next Monday.
        </div>
      ) : (
        <>
          <section>
            <table className="season">
              <thead>
                <tr>
                  <th>Rival</th>
                  <th>Wins</th>
                  <th>Weeks</th>
                  <th>Total pts</th>
                  <th>League pts</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.userId}>
                    <td>
                      {r.name}
                      {r.userId === session.userId ? (
                        <span className="muted tiny"> · you</span>
                      ) : null}
                    </td>
                    <td>{r.wins}</td>
                    <td>{r.weeksPlayed}</td>
                    <td className="muted">{Math.round(r.totalPoints)}</td>
                    <td>
                      <b>{r.leaguePoints}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note">
              Ranking on weekly finishes rather than raw points means one wrecked exam
              week doesn&apos;t end your season.
            </p>
          </section>

          <section>
            <h2>Past weeks</h2>
            <div className="cols2">
              {recent.map(({ week, rows }) => (
                <div key={week}>
                  <div className="tiny muted" style={{ marginBottom: 6 }}>
                    {prettyRange(week, weekEnd(week))}
                  </div>
                  <div className="list">
                    {rows.map((r) => (
                      <div
                        key={r.userId}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "9px 0",
                        }}
                      >
                        <span>
                          <span className="muted">{r.rank}.</span>{" "}
                          {r.rank === 1 ? <b>{r.name}</b> : r.name}
                        </span>
                        <span className="pts">{r.points}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}
