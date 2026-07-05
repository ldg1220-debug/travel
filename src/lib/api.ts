import type { ItineraryItem, Place, Region } from "./types";
import type { CuisineTag, DiscoverBundle, DiscoverScope, DiscoverSpot, DiscoverRoute, PlaceCategoryTag, RegionNode, Season } from "./discoverData";

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

/** Loose category hint for /api/places/search's query-expansion — best-effort, not an exact match to /discover's own tag set. */
function placesSearchCategory(tag?: string): string | undefined {
  if (tag === "관광지" || tag === "테마파크") return "attraction";
  if (tag === "음식점" || tag === "술집") return "restaurant";
  if (tag === "숙소") return "lodging";
  return undefined;
}

/**
 * Real, live place search backing /discover's "실시간 검색 결과" — hits the
 * same Google Places Text Search (overseas) / Kakao Local keyword search
 * (domestic) already used by /planner's sidebar, so an arbitrary real store
 * name (not just /discover's own curated seed list) can actually be found,
 * with real ratings where the underlying API provides them. Never throws:
 * missing API keys, a live-API error, or a network failure all just mean
 * "no live results this time" rather than breaking the rest of the search
 * page, since /discover's curated results are still shown regardless.
 */
export async function fetchLivePlaceSearch(scope: DiscoverScope, query: string, tag?: string): Promise<Place[]> {
  if (!query.trim()) return [];
  try {
    const region: Region = scope === "domestic" ? "domestic" : "international";
    const params = new URLSearchParams({ region, q: query });
    const category = placesSearchCategory(tag);
    if (category) params.set("category", category);
    const res = await fetch(`/api/places/search?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { places?: Place[]; source?: "google" | "kakao" | "mock" };
    // "mock" means the route had no real API key (or the live call itself
    // failed) and quietly fell back to a cached/offline place list — showing
    // that under a "실시간 검색 결과 · 실제 장소" heading would be misleading,
    // so only a genuine google/kakao hit counts as a live result here.
    if (data.source !== "google" && data.source !== "kakao") return [];
    return data.places ?? [];
  } catch {
    return [];
  }
}

export interface PlaceDetails {
  photoNames: string[];
  reviews: { author: string; rating: number | null; text: string; when: string }[];
  rating: number | null;
  reviewCount: number | null;
  openNow: boolean | null;
}

/** Google reviews + photo gallery for the detail popup — the in-app stand-in for the menu tab (Places API exposes no menu data). Returns null on any failure so the caller can just hide the section. */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!placeId.trim()) return null;
  try {
    const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
    if (!res.ok) return null;
    return (await res.json()) as PlaceDetails;
  } catch {
    return null;
  }
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
  regionTree: RegionNode[];
  season: Season;
  /** Set when a fully-drilled-down 지역별 selection had nothing, and the bundle fell back to scope-wide popular spots instead. */
  notice: "coming_soon" | null;
}

/**
 * Browse feed for /discover — branches by scope + category (계절별/최근
 * 핫한/지역별). `path` is the 지역별 drill-down so far, most-general
 * first: [continent, country, city] overseas, [region, neighborhood]
 * domestic (see regionHierarchy/matchesRegionPath in discoverData.ts).
 */
export async function fetchDiscoverBundle(
  scope: DiscoverScope,
  category: string,
  path: string[],
): Promise<DiscoverBrowseResponse> {
  const params = new URLSearchParams({ scope, category });
  if (path.length > 0) params.set("path", path.join(","));
  const res = await fetch(`/api/discover/trends?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load discover feed");
  return res.json();
}

export interface DiscoverSearchPagination {
  page: number;
  limit: number;
  /** Total matching spots (post category/cuisine filter, pre-pagination) — drives the page-number UI. */
  total: number;
  hasMore: boolean;
  /** Mocked for shape-compatibility with a real Places API paged response — not currently decoded, paging is driven by `page` directly. */
  nextPageToken: string | null;
}

export interface DiscoverSearchResponse {
  /** `spots` is just the current page (<= limit items) — routes are small enough to stay unpaginated. */
  results: { spots: DiscoverSpot[]; routes: DiscoverRoute[] };
  /** Category implied by an intent keyword or dish name in the query (e.g. "밥집"/"라멘" -> 음식점), for auto-activating the results' filter chip. Null if the query had no recognizable intent. */
  intentTag: PlaceCategoryTag | null;
  /** The category actually applied server-side: an explicit `tag` override, else `intentTag`, else "all". */
  appliedCategory: PlaceCategoryTag | "all";
  pagination: DiscoverSearchPagination;
}

export interface DiscoverSearchOptions {
  /** Explicit category chip override — omit to let the server fall back to the query's detected intent. */
  tag?: PlaceCategoryTag | "all";
  /** 음식점 sub-filter — only meaningful when tag (or the detected intent) is 음식점. */
  cuisine?: CuisineTag | "all";
  page?: number;
  limit?: number;
}

/** Free-text, server-side-paginated search across /discover's spots + routes for the given scope. */
export async function fetchDiscoverSearch(
  scope: DiscoverScope,
  query: string,
  options: DiscoverSearchOptions = {},
): Promise<DiscoverSearchResponse> {
  const params = new URLSearchParams({ scope, q: query });
  if (options.tag && options.tag !== "all") params.set("tag", options.tag);
  if (options.cuisine && options.cuisine !== "all") params.set("cuisine", options.cuisine);
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  const res = await fetch(`/api/discover/trends?${params.toString()}`);
  if (!res.ok) throw new Error("Discover search failed");
  return res.json();
}
