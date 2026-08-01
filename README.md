# Academic Rivals

A weekly productivity leaderboard for a small group of friends. Everyone logs
their hours against a shared set of categories; the standings update live and
freeze every Monday.

**Live:** https://web-production-daa43.up.railway.app

Pushing to `main` deploys automatically — Railway builds from this repo.

## The scoring model

Categories live in the database and are edited from the **Categories** screen —
name, scoring type and rate. [`src/lib/config.ts`](src/lib/config.ts) only holds
the defaults used to seed an empty install.

There are three scoring types:

| Type | Behaviour |
| --- | --- |
| **Earns points** | A flat rate per hour, linear and uncapped. |
| **Loses points** | A flat negative rate per hour, linear and uncapped. |
| **Hits a range** | Full points inside a low–high band, decaying to zero a full band-width outside it. |

The defaults, which you should retune once you've used it for a week:

| Category | Type | Scoring |
| --- | --- | --- |
| Schoolwork | earns | 10 pts/h |
| Projects & ECs | earns | 12 pts/h |
| Exercise | earns | 10 pts/h |
| Reading | earns | 7.5 pts/h |
| Junk Screen Time | loses | −10 pts/h |
| Sleep | range | 7–9h, 15 pts inside; zero below 5h or above 11h |

Two things to know about this model:

- **Hours are uncapped and linear.** The tenth hour of schoolwork is worth
  exactly as much as the first, and four 4-hour days score the same as one
  16-hour day. There is nothing in the scoring that prefers consistency — if
  you want that back, it lives in `scoreCategory` in
  [`src/lib/scoring.ts`](src/lib/scoring.ts).
- **Sleep is a range, not a maximum.** Too little and too much both lose
  points, and the falloff is as wide as the band itself.

Days are still scored independently and then summed, which matters for range
categories: sleeping 8h a night should beat sleeping 56h in one go, and summing
the week's minutes first would call those equal.

## Anti-inflation

Self-reported hours plus competition equals inflation, and that — not the tech —
is what kills this kind of app. The defences:

- **Everything is public.** Every rival sees every number. This is the real one.
- **Nothing caps the hours.** Caps were removed by request, so the only thing
  discouraging inflated numbers is that everyone can see them.
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
npm test    # 18 tests covering scoring, ranges, custom categories, streaks, dates
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
