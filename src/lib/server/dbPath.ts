import path from "node:path";

/** Self-hosted "trending places" store — swap for a Postgres/Supabase table in production. */
export const TRENDING_PLACES_DB_PATH = path.join(process.cwd(), "data", "trending-places.json");
