# Academic Rivals

A weekly productivity leaderboard for a small group of friends. Everyone logs
their hours against a shared set of categories; the standings update live and
freeze every Monday.

## The scoring model

Categories live in the database and are edited from the **Categories** screen —
name, scoring type, rates and caps. [`src/lib/config.ts`](src/lib/config.ts)
only holds the defaults used to seed an empty install.

There are three scoring types:

| Type | Behaviour |
| --- | --- |
| **Earns points** | Full rate up to a soft cap, half rate beyond it, nothing past the hard cap. |
| **Loses points** | A flat negative rate per hour, up to a hard cap. |
| **Hits a target** | Full points inside `target ± drift`, decaying to zero at twice the drift. |

The defaults, which you should retune once you've used it for a week:

| Category | Type | Rate | Caps |
| --- | --- | --- | --- |
| Schoolwork | earns | 10 pts/h | full to 4h, half to 8h |
| Projects & ECs | earns | 12 pts/h | full to 3h, half to 6h |
| Exercise | earns | 20 pts/h | full to 1h, half to 2h |
| Reading | earns | 15 pts/h | full to 1h, half to 2h |
| Junk Screen Time | loses | −10 pts/h | capped at 8h |
| Sleep | target | 15 pts max | full at 8h ±1.5h, zero outside 5–11h |

Three deliberate choices:

- **Diminishing returns.** Four steady 4-hour days score 160; one 16-hour binge
  scores 60. This rewards the behaviour you actually want and makes
  exaggeration pointless past a certain number.
- **High rate, low cap on Exercise and Reading.** They reward showing up daily
  rather than grinding.
- **Sleep is a band, not a maximum.** Too little and too much both lose points.

Each day is scored independently and then summed. Summing a week's minutes and
scoring once would let a single huge day masquerade as a consistent week.

## Anti-inflation

Self-reported hours plus competition equals inflation, and that — not the tech —
is what kills this kind of app. The defences:

- **Everything is public.** Every rival sees every number. This is the real one.
- **Hard caps** make lying past a certain number score nothing.
- **A 3-day edit window** (`EDIT_GRACE_DAYS`). You cannot invent a whole week on
  Sunday night; the server re-checks this, so a stale tab can't write to a
  locked week either.
- **Locked weeks are snapshotted** into `week_scores`. Retuning a category in
  October cannot rewrite who won in September.

## Editing categories

- **Edit** changes scoring from now on. Weeks that have already closed are
  frozen and won't move.
- **Delete** archives the category: it disappears from logging, but the hours
  already recorded against it are kept, and the current week still counts them.
- **Erase for good** (only offered on already-deleted categories) drops the
  category *and every hour ever logged against it*. It cannot be undone.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, GROUP_CODE, SESSION_SECRET
npm run dev
```

The schema applies itself on first query and seeds the default categories —
there is no migration step to run.

```bash
npm test    # 18 tests covering scoring, custom categories, streaks, dates
```

## Deploying to Railway

1. Create the project and add a **Postgres** database to it.
2. Add this app as a service from the repo.
3. Set the service variables:
   - `DATABASE_URL` → `${{Postgres.DATABASE_URL}}` (a reference, not a literal)
   - `GROUP_CODE` → the shared password for your group
   - `SESSION_SECRET` → `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `APP_TIMEZONE` → e.g. `America/New_York`
4. Generate a domain under Settings → Networking.

## Auth

Deliberately minimal, because you all already know each other:

1. One shared `GROUP_CODE` gates the site. That's the real door.
2. Inside, you pick your name and set a PIN on first login. The PIN only stops
   your rivals from logging hours as you.

No email, no OAuth, no password reset flow to babysit. If someone forgets their
PIN, clear their row and let them re-claim the name:

```sql
DELETE FROM users WHERE handle = 'their name in lowercase';
-- entries cascade, so do this only for someone with nothing logged
```

## Weekly close

There is no cron job. `lockFinishedWeeks()` runs when someone loads the
leaderboard or season page, so the first person to open the app on Monday closes
out Sunday. The primary key on `week_scores` makes the snapshot happen once.

## Things worth agreeing on before you start

The app can't settle these for you, and they matter more than the code:

- **What counts as Schoolwork?** Focused time only, or does a lecture you zoned
  out in count? Pick one and say it out loud.
- **Where does Screen Time come from?** iOS Screen Time / Android Digital
  Wellbeing, read off once a day. If people estimate it, it becomes fiction.
- **What are the stakes?** Loser buys coffee, or picks next week's group
  challenge. A leaderboard with nothing attached stops mattering around week 4.
