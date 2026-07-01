import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Place } from "@/lib/types";
import { TRENDING_PLACES_DB_PATH } from "@/lib/server/dbPath";

/**
 * Step 5 — DB write.
 *
 * Persists the curated place list as a JSON file so `getTrendingPlaces()`
 * can serve it via Next.js ISR at zero per-request cost. Swap this write
 * for an upsert into a `places` table (Postgres/Supabase) in production —
 * the read side (`src/lib/server/getTrendingPlaces.ts`) is the only other
 * place that needs to change.
 */
export async function saveTrendingPlaces(places: Place[]): Promise<void> {
  await mkdir(path.dirname(TRENDING_PLACES_DB_PATH), { recursive: true });
  await writeFile(TRENDING_PLACES_DB_PATH, JSON.stringify(places, null, 2) + "\n", "utf-8");
}
