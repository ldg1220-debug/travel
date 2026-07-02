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
  category: string;
  color: string;
  lat: number;
  lng: number;
  rating?: number;
  address?: string;
  icon: PlaceIcon;
}

export interface ItineraryItem {
  id: string;
  placeId: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  coordinates: { lat: number; lng: number };
  /** Estimated cost for this stop, in JPY. */
  budget?: number;
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
