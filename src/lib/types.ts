/** Which map engine + trend data source is active. */
export type Region = "domestic" | "international";

/**
 * 예산 통화 — 같은 여행이라도 항공권·숙소는 한국에서 원화로 결제하고
 * 현지 식비·입장료 등은 그 나라 통화로 쓰는 경우가 흔해서, 지역(국내/해외)
 * 단위가 아니라 일정 항목 하나하나에 통화를 붙인다(ItineraryItem.budgetCurrency).
 * 서로 다른 통화를 환율로 환산해 하나의 합계로 억지로 더치지 않고, 통화별로
 * 각각의 금액을 그대로 보여준다 — 실시간 환율 없이도 정확하고, 오해의
 * 소지가 없다.
 */
export type CurrencyCode = "KRW" | "JPY" | "USD" | "EUR" | "GBP" | "CNY" | "TWD" | "THB" | "VND" | "AUD";

export const CURRENCY_OPTIONS: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: "KRW", symbol: "₩", label: "원 (KRW)" },
  { code: "JPY", symbol: "¥", label: "엔 (JPY)" },
  { code: "USD", symbol: "$", label: "달러 (USD)" },
  { code: "EUR", symbol: "€", label: "유로 (EUR)" },
  { code: "GBP", symbol: "£", label: "파운드 (GBP)" },
  { code: "CNY", symbol: "¥", label: "위안 (CNY)" },
  { code: "TWD", symbol: "NT$", label: "대만달러 (TWD)" },
  { code: "THB", symbol: "฿", label: "바트 (THB)" },
  { code: "VND", symbol: "₫", label: "동 (VND)" },
  { code: "AUD", symbol: "A$", label: "호주달러 (AUD)" },
];

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCY_OPTIONS.find((c) => c.code === code)?.symbol ?? "₩";
}

/** Sums a list of budgeted items' amounts per currency (환율 환산 없이 통화별로 그대로 더한다) — items with no budget are skipped. Result order follows CURRENCY_OPTIONS (KRW 먼저). */
export function groupBudgetByCurrency(items: { budget?: number; budgetCurrency?: CurrencyCode }[]): { currency: CurrencyCode; total: number }[] {
  const totals = new Map<CurrencyCode, number>();
  for (const item of items) {
    if (!item.budget) continue;
    const currency = item.budgetCurrency ?? "KRW";
    totals.set(currency, (totals.get(currency) ?? 0) + item.budget);
  }
  return CURRENCY_OPTIONS.filter((c) => totals.has(c.code)).map((c) => ({ currency: c.code, total: totals.get(c.code) as number }));
}

export type PlaceIcon =
  | "coffee"
  | "museum"
  | "tree"
  | "boat"
  | "utensils"
  | "camera"
  | "pin";

export interface Place {
  /** Internal row id */
  id: string;
  /** Google Places `place_id`, used for map markers & detail lookups */
  placeId: string;
  name: string;
  /** Native-language display name (e.g. "魚心") when it differs from the localized `name` — only set on live Google results, to disambiguate inconsistent ko transliterations. */
  nativeName?: string;
  category: string;
  color: string;
  lat: number;
  lng: number;
  rating?: number;
  /** Number of Google reviews backing `rating` — only present on live Google results. */
  reviewCount?: number;
  /** Coarse Google price tier, 0 (free) – 4 (very expensive). A proxy for cost (Places has no real nightly rate) — used for the 가격대순 sort on lodging results. Undefined when Google didn't provide one. */
  priceLevel?: number;
  address?: string;
  /** First Google photo resource name (`places/…/photos/…`) — rendered through the keyless /api/places/photo proxy. */
  photoName?: string;
  /** Deep link to this place on Google Maps — menu/reviews/full photos live there (the Places API doesn't expose menu data itself). */
  googleMapsUri?: string;
  /** Free-text note, editable from the planner's 관심 장소 detail overlay. */
  memo?: string;
  icon: PlaceIcon;
  /** Which user-defined 관심 장소 보관함 folder (see `SavedPlaceFolder`) this is filed under — undefined means unfiled. Only meaningful for entries in `savedPlaces`; a folder assignment has no effect on the planner's schedulable `places` catalog. */
  folderId?: string;
}

/** A user-named folder for organizing 관심 장소 보관함 (saved-places) into custom groups — e.g. "오사카 후보", "다음에 가볼 곳" — distinct from the fixed 6-category classification. */
export interface SavedPlaceFolder {
  id: string;
  name: string;
}

export interface ItineraryItem {
  id: string;
  placeId: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm start time */
  time: string;
  /** Length of this stop, in minutes — resizable in 15-minute steps via the timeline's drag handle. */
  durationMinutes: number;
  coordinates: { lat: number; lng: number };
  /** Estimated cost for this stop, denominated in `budgetCurrency`. */
  budget?: number;
  /** Which currency `budget` is in — defaults to "KRW" when a stop has a budget but no currency recorded yet (e.g. items saved before this field existed). */
  budgetCurrency?: CurrencyCode;
}

/**
 * A named snapshot of a whole working itinerary — lets a user keep several
 * trip drafts side by side (e.g. "오사카안 A" vs "오사카안 B") and switch
 * between them instead of only ever having one active plan. Capped at
 * MAX_SAVED_PLANS in itineraryStore.
 */
export interface SavedPlan {
  id: string;
  name: string;
  savedAt: number;
  items: ItineraryItem[];
  places: Place[];
  activeDate: string;
  currentCity: string;
  region: Region;
  /**
   * This plan's own row in the server `itineraries` table, once it's been
   * saved while logged in — lets re-sharing or re-saving the SAME plan
   * update that one row/shareToken instead of each save/share silently
   * reusing whichever itinerary row happened to be the user's most recent
   * one (the old "one itinerary per user" model, which made every share
   * link from an account alias the same underlying data no matter which
   * plan was actually shared). Undefined for a plan that's only ever
   * existed locally (not logged in, or saved before this existed).
   */
  remoteId?: number;
  shareToken?: string;
}

/**
 * Canonical shape of an `itineraries` row (see prisma/schema.prisma's
 * `Itinerary` model / src/server/db/schema.sql). No current API route
 * returns every one of these fields at once — GET /api/itineraries and
 * the shared-itinerary routes each project a subset — this exists so
 * future community-feature code (discover feed, forking, likes) has one
 * shared type to build against instead of re-declaring an ad hoc shape.
 */
export interface Itinerary {
  id: number;
  userId: number;
  title: string;
  region: Region;
  placesData: ItineraryItem[];
  shareToken: string | null;
  /** Whether this trip is listed on the /discover feed. */
  isPublic: boolean;
  /** The itinerary this one was forked from, if any. */
  forkedFromId: number | null;
  likesCount: number;
  forksCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A single cached place-to-place transit estimate (see src/lib/transit.ts). */
export interface TransitRoute {
  id: number;
  fromPlaceId: string;
  toPlaceId: string;
  durationMins: number;
  transitMode: "WALKING" | "TRANSIT";
  createdAt: string;
  updatedAt: string;
}

/** A review left for a place (`placeId` is an external id, e.g. a Google Place ID). */
export interface Review {
  id: number;
  userId: number;
  placeId: string;
  content: string;
  /** 0.0–5.0 */
  rating: number;
  isVerified: boolean;
  images: string[];
  createdAt: string;
  updatedAt: string;
}
