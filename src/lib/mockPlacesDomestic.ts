import type { Place } from "./types";

/**
 * Dummy domestic (Seoul) trending list. Per spec this is a mockup for
 * Phase 4 — a real deployment would collect these from Naver Place /
 * blog "내돈내산" posts the same way the international pipeline
 * (src/server/pipeline) collects from IG/TikTok.
 */
export const DOMESTIC_PLACES: Place[] = [
  {
    id: "d1",
    placeId: "kakao-place-1",
    name: "Seongsu Coffee Roasters",
    category: "Cafe",
    color: "#FF6B6B",
    lat: 37.5445,
    lng: 127.0559,
    rating: 4.5,
    icon: "coffee",
  },
  {
    id: "d2",
    placeId: "kakao-place-2",
    name: "Bukchon Hanok Village",
    category: "Viewpoint",
    color: "#EC4899",
    lat: 37.5826,
    lng: 126.9832,
    rating: 4.7,
    icon: "camera",
  },
  {
    id: "d3",
    placeId: "kakao-place-3",
    name: "Gwangjang Market Eats",
    category: "Restaurant",
    color: "#A855F7",
    lat: 37.5701,
    lng: 126.9996,
    rating: 4.6,
    icon: "utensils",
  },
  {
    id: "d4",
    placeId: "kakao-place-4",
    name: "Han River Ttukseom Park",
    category: "Park",
    color: "#22B07D",
    lat: 37.5299,
    lng: 127.0669,
    rating: 4.4,
    icon: "tree",
  },
  {
    id: "d5",
    placeId: "kakao-place-5",
    name: "National Museum of Korea",
    category: "Museum",
    color: "#4A90E2",
    lat: 37.5240,
    lng: 126.9803,
    rating: 4.8,
    icon: "museum",
  },
  {
    id: "d6",
    placeId: "kakao-place-6",
    name: "Yeouido Hangang Boat Pier",
    category: "Harbor",
    color: "#F5A524",
    lat: 37.5296,
    lng: 126.9336,
    rating: 4.3,
    icon: "boat",
  },
];
