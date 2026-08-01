import { redirect } from "next/navigation";
import { getSession, groupCodeMatches, hashPin, startSession, verifyPin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

type Search = Promise<{ error?: string }>;

async function login(formData: FormData) {
  "use server";

  const code = String(formData.get("code") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "");

  const fail = (msg: string): never => redirect(`/login?error=${encodeURIComponent(msg)}`);

  if (!groupCodeMatches(code)) fail("Wrong group code.");
  if (name.length < 2 || name.length > 24) fail("Name must be 2–24 characters.");
  if (!/^\d{4,8}$/.test(pin)) fail("PIN must be 4–8 digits.");

  const handle = name.toLowerCase().replace(/\s+/g, " ");
  const existing = await queryOne<{ id: number; pin_hash: string }>(
    `SELECT id, pin_hash FROM users WHERE handle = $1`,
    [handle],
  );

  let userId: number;
  if (existing) {
    if (!verifyPin(pin, existing.pin_hash)) fail("Wrong PIN for that name.");
    userId = existing.id;
  } else {
    // Claim-on-first-use: the first person to type a name owns it, and the PIN
    // they choose becomes theirs. Fine for a group that already knows each other.
    const created = await queryOne<{ id: number }>(
      `INSERT INTO users (name, handle, pin_hash) VALUES ($1, $2, $3) RETURNING id`,
      [name, handle, hashPin(pin)],
    );
    userId = created!.id;
  }

  await startSession(userId);
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;

  // Show who's already in so people type their name the same way twice.
  const rivals = await query<{ name: string }>(`SELECT name FROM users ORDER BY name`);

  return (
    <div className="center">
      <div className="box">
        <h1>Academic Rivals</h1>
        <p className="muted small" style={{ marginTop: 4, marginBottom: 22 }}>
          Log your hours. Get ranked every Monday.
        </p>

        <form action={login}>
          <div className="stack">
            <label htmlFor="code">Group code</label>
            <input id="code" name="code" className="field" type="password" required autoComplete="off" />
          </div>

          <div className="stack">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              name="name"
              className="field"
              type="text"
              required
              autoComplete="username"
              placeholder="First name is fine"
            />
          </div>

          <div className="stack">
            <label htmlFor="pin">PIN (4–8 digits)</label>
            <input
              id="pin"
              name="pin"
              className="field"
              type="password"
              inputMode="numeric"
              required
              autoComplete="current-password"
            />
          </div>

          {error ? <div className="error">{error}</div> : null}

          <button className="primary block" type="submit" style={{ marginTop: 18 }}>
            Enter
          </button>
        </form>

        <p className="note">
          A new name creates an account, and the PIN you pick becomes yours.
          {rivals.length > 0
            ? ` Already competing: ${rivals.map((r) => r.name).join(", ")}.`
            : ""}
        </p>
      </div>
    </div>
  );
}
