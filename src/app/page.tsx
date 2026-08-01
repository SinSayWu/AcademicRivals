import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { getDay, saveEntries } from "@/lib/data";
import { listCategories } from "@/lib/categories";
import { addDays, isEditable, prettyDate, today } from "@/lib/dates";
import { validateMinutes, type MinutesMap } from "@/lib/scoring";
import { EDIT_GRACE_DAYS } from "@/lib/config";
import LogForm from "./LogForm";
import Shell from "./Shell";

export const dynamic = "force-dynamic";

type Search = Promise<{ date?: string }>;

export default async function LogPage({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const now = today();
  const { date: requested } = await searchParams;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : now;
  const editable = isEditable(date, now);

  const [minutes, categories] = await Promise.all([
    getDay(session.userId, date),
    listCategories(),
  ]);

  async function save(input: MinutesMap) {
    "use server";
    const me = await getSession();
    if (!me) redirect("/login");
    // Re-check the window server-side; a stale tab must not be able to write
    // into a week that has already been locked and scored.
    if (!isEditable(date, today())) return;

    const cats = await listCategories();
    const clean: MinutesMap = {};
    for (const [key, value] of Object.entries(input)) {
      const safe = validateMinutes(cats, key, value);
      if (safe !== null) clean[key] = safe;
    }
    await saveEntries(me.userId, date, clean);
    revalidatePath("/");
    revalidatePath("/leaderboard");
  }

  const prev = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <Shell
      active="log"
      user={session.name}
      title={date === now ? "Today" : prettyDate(date)}
      subtitle={
        date === now
          ? `${prettyDate(date)} · editable for ${EDIT_GRACE_DAYS} more days`
          : editable
            ? "Still within the edit window"
            : "Locked"
      }
      actions={
        <div className="daynav">
          {isEditable(prev, now) ? (
            <Link href={`/?date=${prev}`} aria-label="Previous day">
              ←
            </Link>
          ) : (
            <span className="disabled">←</span>
          )}
          {date < now ? (
            <Link href={`/?date=${next}`} aria-label="Next day">
              →
            </Link>
          ) : (
            <span className="disabled">→</span>
          )}
        </div>
      }
    >
      <LogForm
        key={date}
        categories={categories}
        initial={minutes}
        editable={editable}
        save={save}
      />
    </Shell>
  );
}
