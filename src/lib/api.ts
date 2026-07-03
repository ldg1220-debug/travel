import type { ItineraryItem, Place, Region } from "./types";
import type { DiscoverBundle, DiscoverScope, DiscoverSpot, DiscoverRoute, Season } from "./discoverData";

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

export async function saveItinerary(
  region: Region,
  placesData: ItineraryItem[],
  title?: string,
): Promise<{ id: number; shareToken: string }> {
  const res = await fetch("/api/itineraries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region, placesData, title }),
  });
  if (!res.ok) throw new Error("Failed to save itinerary");
  return res.json();
}

export interface SharedItinerary {
  title: string;
  region: Region;
  placesData: ItineraryItem[];
  updatedAt: string;
}

export async function fetchSharedItinerary(shareToken: string): Promise<SharedItinerary> {
  const res = await fetch(`/api/itineraries/shared/${shareToken}`);
  if (!res.ok) throw new Error("Failed to load shared itinerary");
  return res.json();
}

export async function pushSharedItinerary(
  shareToken: string,
  region: Region,
  placesData: ItineraryItem[],
): Promise<void> {
  const res = await fetch(`/api/itineraries/shared/${shareToken}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ region, placesData }),
  });
  if (!res.ok) throw new Error("Failed to sync shared itinerary");
}

export interface DiscoverBrowseResponse {
  bundle: DiscoverBundle;
  regions: string[];
  season: Season;
}

/** Browse feed for /discover — branches by scope + category (계절별/최근 핫한/지역별). */
export async function fetchDiscoverBundle(
  scope: DiscoverScope,
  category: string,
  region: string | null,
): Promise<DiscoverBrowseResponse> {
  const params = new URLSearchParams({ scope, category });
  if (region) params.set("region", region);
  const res = await fetch(`/api/discover/trends?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load discover feed");
  return res.json();
}

export interface DiscoverSearchResponse {
  results: { spots: DiscoverSpot[]; routes: DiscoverRoute[] };
}

/** Free-text search across /discover's spots + routes for the given scope. */
export async function fetchDiscoverSearch(scope: DiscoverScope, query: string): Promise<DiscoverSearchResponse> {
  const params = new URLSearchParams({ scope, q: query });
  const res = await fetch(`/api/discover/trends?${params.toString()}`);
  if (!res.ok) throw new Error("Discover search failed");
  return res.json();
}
