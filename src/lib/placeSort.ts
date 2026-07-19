import type { Place } from "./types";

/**
 * "관련도순" is the order the search API already returned (Google/Kakao's
 * own relevance ranking) — everything else re-sorts client-side over the
 * already-fetched batch. Kakao(국내) results never carry rating/reviewCount,
 * so those sorts are effectively no-ops for domestic places (they all tie
 * at 0 and keep relevance order).
 */
export type LiveSortKey = "relevance" | "popularity" | "rating" | "reviews" | "price";

export const LIVE_SORTS: { key: LiveSortKey; label: string }[] = [
  { key: "relevance", label: "관련도순" },
  { key: "popularity", label: "인기순" },
  { key: "rating", label: "별점순" },
  { key: "reviews", label: "리뷰많은순" },
  { key: "price", label: "가격대순" },
];

export function popularityScore(p: Place): number {
  return (p.rating ?? 0) * Math.log10((p.reviewCount ?? 0) + 10);
}

export function sortPlaces(places: Place[], sort: LiveSortKey): Place[] {
  if (sort === "popularity") return [...places].sort((a, b) => popularityScore(b) - popularityScore(a));
  if (sort === "rating") return [...places].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  if (sort === "reviews") return [...places].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
  if (sort === "price") return [...places].sort((a, b) => (a.priceLevel ?? Infinity) - (b.priceLevel ?? Infinity));
  return places;
}
