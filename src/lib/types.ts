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
}
