import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __arPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __arMigrated: Promise<void> | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. On Railway, add a Postgres service and reference " +
        "it as ${{Postgres.DATABASE_URL}} in this service's variables.",
    );
  }
  return new Pool({
    connectionString,
    max: 5,
    // Railway's internal network doesn't need TLS; public proxy URLs do, and
    // their cert chain isn't in the default store.
    ssl: connectionString.includes("railway.internal")
      ? undefined
      : { rejectUnauthorized: false },
  });
}

/**
 * Lazy on purpose. Creating the pool at module scope would throw during
 * `next build`, where DATABASE_URL isn't set — and it's cached on `global`
 * because Next dev reloads modules constantly, which would otherwise leak a
 * connection per reload until Postgres refuses new ones.
 */
export function pool(): Pool {
  return global.__arPool ?? (global.__arPool = makePool());
}

/** Applies schema.sql once per process. Every query path awaits this first. */
export function migrate(): Promise<void> {
  if (!global.__arMigrated) {
    global.__arMigrated = (async () => {
      const sql = readFileSync(path.join(process.cwd(), "src/lib/schema.sql"), "utf8");
      await pool().query(sql);
    })().catch((err) => {
      // Don't cache a failed migration — the next request should retry.
      global.__arMigrated = undefined;
      throw err;
    });
  }
  return global.__arMigrated;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await migrate();
  const res = await pool().query(text, params);
  return res.rows as T[];
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
