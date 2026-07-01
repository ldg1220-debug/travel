import type { Place, Region } from "./types";

export async function fetchTrendingPlaces(region: Region): Promise<Place[]> {
  const res = await fetch(`/api/trends?region=${region}`);
  if (!res.ok) throw new Error("Failed to load trending places");
  const data = (await res.json()) as { places: Place[] };
  return data.places;
}

export async function searchPlaces(region: Region, query: string): Promise<Place[]> {
  if (!query.trim()) return [];
  const res = await fetch(`/api/places/search?region=${region}&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  const data = (await res.json()) as { places: Place[] };
  return data.places;
}
