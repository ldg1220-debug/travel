import type { Place } from "./types";

/**
 * Seed / fallback trending places (Kyoto, Gion district).
 * Used when the pipeline output (data/trending-places.json) hasn't been
 * generated yet, or when the request is served before the first ISR revalidation.
 */
export const FALLBACK_PLACES: Place[] = [
  {
    id: "p1",
    placeId: "ChIJP2AZG3sHAWARM8oM1AGSjXw",
    name: "Cafe Luna",
    category: "Cafe",
    color: "#FF6B6B",
    lat: 35.0037,
    lng: 135.7773,
    rating: 4.6,
    icon: "coffee",
  },
  {
    id: "p2",
    placeId: "ChIJ6aBFVXwHAWAR2m1r2iw5rEE",
    name: "Sunset Museum",
    category: "Museum",
    color: "#4A90E2",
    lat: 35.0116,
    lng: 135.7681,
    rating: 4.4,
    icon: "museum",
  },
  {
    id: "p3",
    placeId: "ChIJTfake04sHAWARriversideParkX",
    name: "Riverside Park",
    category: "Park",
    color: "#22B07D",
    lat: 35.0064,
    lng: 135.7717,
    rating: 4.7,
    icon: "tree",
  },
  {
    id: "p4",
    placeId: "ChIJmzB0e3sHAWARoJvskrLbG8s",
    name: "Blue Harbor",
    category: "Harbor",
    color: "#F5A524",
    lat: 35.0092,
    lng: 135.7825,
    rating: 4.3,
    icon: "boat",
  },
  {
    id: "p5",
    placeId: "ChIJTfake05sHAWARnishikiEatsX",
    name: "Nishiki Market Eats",
    category: "Restaurant",
    color: "#A855F7",
    lat: 35.0051,
    lng: 135.7649,
    rating: 4.8,
    icon: "utensils",
  },
  {
    id: "p6",
    placeId: "ChIJTfake06sHAWARfushimiViewX",
    name: "Fushimi Inari View",
    category: "Viewpoint",
    color: "#EC4899",
    lat: 35.0128,
    lng: 135.7756,
    rating: 4.9,
    icon: "camera",
  },
];
