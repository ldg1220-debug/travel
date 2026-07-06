/** Which map engine + trend data source is active. */
export type Region = "domestic" | "international";

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
  address?: string;
  /** First Google photo resource name (`places/…/photos/…`) — rendered through the keyless /api/places/photo proxy. */
  photoName?: string;
  /** Deep link to this place on Google Maps — menu/reviews/full photos live there (the Places API doesn't expose menu data itself). */
  googleMapsUri?: string;
  /** Free-text note, editable from the planner's 관심 장소 detail overlay. */
  memo?: string;
  icon: PlaceIcon;
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
  /** Estimated cost for this stop, in JPY. */
  budget?: number;
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
