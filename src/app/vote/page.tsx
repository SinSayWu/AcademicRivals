import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { listCategories } from "@/lib/categories";
import { lockFinishedWeeks, listUsers } from "@/lib/data";
import { addDays, prettyRange, today, weekEnd, weekStart } from "@/lib/dates";
import {
  countVoters,
  fieldFor,
  getBallot,
  getLastResult,
  getOpenPoll,
  magnitudeOf,
  saveBallot,
  stepFor,
  type Ballot,
  type Choice,
} from "@/lib/polls";
import Shell from "../Shell";

export const dynamic = "force-dynamic";

/** How a category's current worth reads in the ballot. */
function currentLabel(kind: string, magnitude: number): string {
  if (kind === "target") return `${magnitude} pts inside the range`;
  if (kind === "penalty") return `−${magnitude} pts per hour`;
  return `${magnitude} pts per hour`;
}

/** The three options, worded so "more" always means "counts for more". */
function optionLabels(kind: string): [string, string, string] {
  if (kind === "penalty") return ["Softer", "Leave it", "Harsher"];
  return ["Worth less", "Leave it", "Worth more"];
}

export default async function VotePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Opening and closing polls rides along with week locking.
  await lockFinishedWeeks();

  const [poll, cats, members, last] = await Promise.all([
    getOpenPoll(),
    listCategories(),
    listUsers(),
    getLastResult(),
  ]);

  const myBallot = poll ? await getBallot(poll.weekStart, session.userId) : null;
  const voted = poll ? await countVoters(poll.weekStart) : 0;

  async function submit(form: FormData) {
    "use server";
    const me = await getSession();
    if (!me) redirect("/login");
    const open = await getOpenPoll();
    if (!open) return;

    const all = await listCategories();
    const ballot: Ballot = {};
    for (const cat of all) {
      const raw = Number(form.get(`c_${cat.key}`));
      const choice: Choice = raw > 0 ? 1 : raw < 0 ? -1 : 0;
      ballot[cat.key] = choice;
    }
    await saveBallot(open.weekStart, me.userId, ballot);
    revalidatePath("/vote");
  }

  const closesOn = poll ? addDays(weekStart(today()), 7) : null;

  return (
    <Shell
      active="vote"
      user={session.name}
      title="Weekly vote"
      subtitle={
        poll
          ? `On ${prettyRange(poll.weekStart, weekEnd(poll.weekStart))} · results apply Monday`
          : "Opens every Monday, once the week has closed"
      }
    >
      {poll ? (
        <section>
          <h2>{myBallot ? "Your ballot" : "How should each category count?"}</h2>

          <form action={submit}>
            <div className="list">
              {cats.map((cat) => {
                const mag = magnitudeOf(cat);
                const step = stepFor(mag);
                const mine = myBallot?.[cat.key] ?? 0;
                const [less, keep, more] = optionLabels(cat.kind);
                return (
                  <div className="voterow" key={cat.key}>
                    <div className="info">
                      <div className="name">{cat.label}</div>
                      <div className="hint">
                        Now {currentLabel(cat.kind, mag)} · a vote moves it by {step}
                        {fieldFor(cat) === "rate" ? " per hour" : " pts"}
                      </div>
                    </div>
                    <div className="choices">
                      {(
                        [
                          [-1, less],
                          [0, keep],
                          [1, more],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={value} className="choice">
                          <input
                            type="radio"
                            name={`c_${cat.key}`}
                            value={value}
                            defaultChecked={mine === value}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="formactions">
              <button className="primary" type="submit">
                {myBallot ? "Update my ballot" : "Submit ballot"}
              </button>
              <span className="muted tiny">
                {voted} of {members.length} voted
                {myBallot ? " · you can change yours until it closes" : ""}
              </span>
            </div>
          </form>

          <p className="note">
            Nobody sees anyone else&apos;s answers until the poll closes
            {closesOn ? ` on ${prettyRange(closesOn, closesOn).split(" – ")[0]}` : ""} — a
            running tally would just tell late voters what to pile onto. A simple
            majority wins and a tie changes nothing. Rates only ever change at a week
            boundary, so hours you have already logged are never re-scored.
          </p>
        </section>
      ) : (
        <div className="empty">
          No vote is open right now.
          <br />
          One opens each Monday on the week that just finished.
        </div>
      )}

      {last && last.results && last.results.length > 0 ? (
        <section>
          <h2>Last result · {prettyRange(last.weekStart, weekEnd(last.weekStart))}</h2>
          <div className="list">
            {last.results.map((r) => (
              <div className="row" key={r.key}>
                <div className="info">
                  <div className="name">{r.label}</div>
                  <div className="hint">
                    {r.up} up · {r.keep} leave · {r.down} down
                  </div>
                </div>
                <div className="resultval">
                  {r.after === r.before ? (
                    <span className="muted">unchanged at {r.before}</span>
                  ) : (
                    <>
                      <span className="muted">{r.before}</span>
                      {" → "}
                      <b className={r.after > r.before ? "pts pos" : "pts neg"}>{r.after}</b>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </Shell>
  );
}
