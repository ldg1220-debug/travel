import { pool } from "./db";

/**
 * Fixed-window rate limiter backed by Postgres — not Redis, because this
 * app already has exactly one shared data store and every write route in
 * question is auth-gated (so a Postgres round-trip on the same connection
 * pool costs far less than standing up a second service just for this).
 * A single upsert both checks and increments atomically per key (the
 * primary key makes concurrent hits on the same key serialize on Postgres'
 * row lock, so this doesn't undercount under real concurrency the way a
 * naive read-then-write would).
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const result = await pool.query<{ count: number }>(
    `insert into rate_limits (key, count, "windowStart") values ($1, 1, now())
     on conflict (key) do update set
       count = case when rate_limits."windowStart" > now() - ($2 || ' seconds')::interval
                     then rate_limits.count + 1 else 1 end,
       "windowStart" = case when rate_limits."windowStart" > now() - ($2 || ' seconds')::interval
                             then rate_limits."windowStart" else now() end
     returning count`,
    [key, windowSeconds],
  );
  const count = result.rows[0]?.count ?? 1;
  return count <= limit;
}
