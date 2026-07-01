import { readFile } from "node:fs/promises";
import type { Place } from "@/lib/types";
import { FALLBACK_PLACES } from "@/lib/mockPlaces";
import { TRENDING_PLACES_DB_PATH } from "./dbPath";

/**
 * Reads the self-hosted "trending places" DB written by the data pipeline
 * (src/server/pipeline). Falls back to the seed list before the pipeline
 * has run for the first time. Swap this for a Postgres/Supabase query when
 * moving off the JSON-file store.
 */
export async function getTrendingPlaces(): Promise<Place[]> {
  try {
    const raw = await readFile(TRENDING_PLACES_DB_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Place[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // No pipeline output yet — serve the seed list.
  }
  return FALLBACK_PLACES;
}
