import { Pool } from "pg";

// Reuse one pool across dev HMR reloads instead of opening a new one per
// module re-evaluation (same pattern commonly used for Prisma singletons).
declare global {
  var __pgPool: Pool | undefined;
}

export const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}
