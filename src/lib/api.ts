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

export interface RecommendedStop extends Place {
  slotLabel: string;
  hour: number;
  meal: boolean;
}

/** AI 추천 동선 — a full auto-assembled day course of real top-rated places for a city. Empty array when the live API is unavailable (no key). */
export async function fetchRecommendedCourse(scope: DiscoverScope, city: string): Promise<RecommendedStop[]> {
  if (!city.trim()) return [];
  try {
    const res = await fetch(`/api/course/recommend?scope=${scope}&city=${encodeURIComponent(city)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { course?: RecommendedStop[]; source?: string };
    if (data.source !== "google" && data.source !== "kakao") return [];
    return data.course ?? [];
  } catch {
    return [];
  }
}

/**
 * Creates or updates one of the current user's server-side itineraries.
 * Pass `id` (a SavedPlan's own `remoteId`, if it has one) to update that
 * specific plan in place and reuse its existing shareToken — omitting it
 * always creates a new row, so saving/sharing a plan that was never synced
 * before doesn't collide with any other plan's row.
 */
export async function saveItinerary(
  region: Region,
  placesData: ItineraryItem[],
  title?: string,
  id?: number,
): Promise<{ id: number; shareToken: string }> {
  const res = await fetch("/api/itineraries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, region, placesData, title }),
  });
  if (!res.ok) throw new Error("Failed to save itinerary");
  return res.json();
}

export interface UserItinerary {
  id: number;
  title: string;
  region: Region;
  placesData: ItineraryItem[];
  shareToken: string;
}

/** Every itinerary the logged-in user has saved/shared across any device — used to hydrate 저장된 계획 on login. */
export async function fetchUserItineraries(): Promise<UserItinerary[]> {
  const res = await fetch("/api/itineraries");
  if (!res.ok) return [];
  const data = (await res.json()) as { itineraries?: UserItinerary[] };
  return data.itineraries ?? [];
}

/**
 * Deletes a saved plan's server-side row. Without this, deleting a synced
 * plan only ever removed it from this device's local list — the next
 * cross-device hydration (e.g. a page refresh) would fetch the still-alive
 * server row and pull it right back in as a "new" plan.
 */
export async function deleteItinerary(id: number): Promise<void> {
  await fetch(`/api/itineraries?id=${id}`, { method: "DELETE" });
}

export interface SharedItinerary {
  title: string;
  region: Region;
  placesData: ItineraryItem[];
  updatedAt: string;
}

/** A shared link is a read-only snapshot as of when it was created/last re-shared — nothing pushes edits back to it automatically. */
export async function fetchSharedItinerary(shareToken: string): Promise<SharedItinerary> {
  const res = await fetch(`/api/itineraries/shared/${shareToken}`);
  if (!res.ok) throw new Error("Failed to load shared itinerary");
  return res.json();
}

export interface Review {
  id: number;
  itineraryId: number | null;
  placeId: string;
  placeName: string;
  rating: number;
  content: string;
  images: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Uploads one or more 후기 photos to Vercel Blob, returning their public URLs. */
export async function uploadReviewPhotos(files: File[]): Promise<string[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to upload photos");
  }
  const data = (await res.json()) as { urls: string[] };
  return data.urls;
}

/** Every review the current user has written, optionally scoped to one trip — used to prefill 후기 작성 and show per-trip progress. */
export async function fetchMyReviews(itineraryId?: number): Promise<Review[]> {
  const url = itineraryId ? `/api/reviews?itineraryId=${itineraryId}` : "/api/reviews";
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { reviews?: Review[] };
  return data.reviews ?? [];
}

/** Creates or updates the current user's review for a place within a trip — `itineraryId` null for a place added ad-hoc to a 여행 후기 with no linked saved plan. */
export async function saveReview(input: {
  itineraryId: number | null;
  placeId: string;
  placeName: string;
  rating: number;
  content: string;
  images: string[];
  isPublic: boolean;
}): Promise<{ id: number }> {
  const res = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to save review");
  return res.json();
}

export async function deleteReview(id: number): Promise<void> {
  await fetch(`/api/reviews?id=${id}`, { method: "DELETE" });
}

export interface TripPost {
  id: number;
  itineraryId: number | null;
  title: string;
  content: string;
  images: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The current user's own trip post for a specific trip, if they've written one — used to prefill 여행 후기 쓰기. */
export async function fetchMyTripPost(itineraryId: number): Promise<TripPost | null> {
  const res = await fetch(`/api/trip-posts?itineraryId=${itineraryId}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { posts?: TripPost[] };
  return data.posts?.[0] ?? null;
}

/** Every trip post the current user has ever written, most recently edited first — used to tell 여행 보관함 which saved plans have actually been written about ("다녀온 여행"), and to list/re-open posts that aren't tied to any saved plan. */
export async function fetchMyTripPosts(): Promise<TripPost[]> {
  const res = await fetch("/api/trip-posts");
  if (!res.ok) return [];
  const data = (await res.json()) as { posts?: TripPost[] };
  return data.posts ?? [];
}

/**
 * Creates or updates the current user's overall blog/Instagram-style
 * write-up for a trip. Pass `id` to update that specific post directly
 * (needed once it's not tied to a plan, since there's nothing else to
 * upsert against); otherwise `itineraryId` upserts the one post for that
 * plan, or omit both for a wholly fresh, plan-less post.
 */
export async function saveTripPost(input: {
  id?: number;
  itineraryId?: number | null;
  title: string;
  content: string;
  images: string[];
  isPublic: boolean;
}): Promise<{ id: number }> {
  const res = await fetch("/api/trip-posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to save trip post");
  return res.json();
}

export async function deleteTripPost(id: number): Promise<void> {
  await fetch(`/api/trip-posts?id=${id}`, { method: "DELETE" });
}

export interface FeedPost {
  id: number;
  title: string;
  content: string;
  images: string[];
  createdAt: string;
  authorName: string | null;
  authorImage: string | null;
  tripTitle: string | null;
}

export interface FeedResponse {
  posts: FeedPost[];
  pagination: { page: number; limit: number; total: number; hasMore: boolean };
}

/** The public in-app feed of everyone's published 여행 후기 (trip posts), most recent first. */
export async function fetchFeed(page = 1, limit = 10): Promise<FeedResponse> {
  const res = await fetch(`/api/feed?page=${page}&limit=${limit}`);
  if (!res.ok) return { posts: [], pagination: { page, limit, total: 0, hasMore: false } };
  return res.json();
}

export interface TripPostPlaceReview {
  placeId: string;
  placeName: string;
  rating: number;
  content: string;
  images: string[];
}

export interface TripPostDetail extends FeedPost {
  isPublic: boolean;
}

/** A single trip post with author/trip context and its author's per-place ratings for the same trip (embedded "다녀온 장소" section) — null if it doesn't exist or isn't visible to the current viewer. */
export async function fetchTripPost(id: number): Promise<{ post: TripPostDetail; placeReviews: TripPostPlaceReview[]; isOwner: boolean } | null> {
  const res = await fetch(`/api/trip-posts/${id}`);
  if (!res.ok) return null;
  return res.json();
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
  /** 계절/핫한 check-filters — combinable with each other and with a region path. */
  checks?: { season?: boolean; hot?: boolean },
): Promise<DiscoverBrowseResponse> {
  const params = new URLSearchParams({ scope, category });
  if (path.length > 0) params.set("path", path.join(","));
  if (checks?.season) params.set("season", "1");
  if (checks?.hot) params.set("hot", "1");
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
