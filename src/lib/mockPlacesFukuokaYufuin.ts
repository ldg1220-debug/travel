import type { Place } from "./types";

/**
 * Seed data for the /planner screen (src/app/(app)/planner/),
 * used to exercise real Google Maps rendering + Polyline route drawing.
 * Fukuoka (Tenjin/Hakata) and Yufuin are ~55km apart, spanning two
 * prefectures, so the map has to actually fit/zoom to a real spread of
 * coordinates rather than a tight cluster.
 */
export const FUKUOKA_YUFUIN_PLACES: Place[] = [
  {
    id: "fy1",
    placeId: "fukuoka-tenjin-ramen",
    name: "Tenjin Ramen Alley",
    category: "Restaurant",
    color: "#FF6B6B",
    lat: 33.5904,
    lng: 130.3986,
    rating: 4.5,
    icon: "utensils",
  },
  {
    id: "fy2",
    placeId: "fukuoka-hakata-hotel",
    name: "Hakata Stay Hotel",
    category: "Hotel",
    color: "#4A90E2",
    lat: 33.5895,
    lng: 130.4207,
    rating: 4.2,
    icon: "pin",
  },
  {
    id: "fy3",
    placeId: "fukuoka-ohori-park",
    name: "Ohori Park",
    category: "Park",
    color: "#22B07D",
    lat: 33.5847,
    lng: 130.3806,
    rating: 4.6,
    icon: "tree",
  },
  {
    id: "fy4",
    placeId: "yufuin-floral-village",
    name: "Yufuin Floral Village",
    category: "Viewpoint",
    color: "#EC4899",
    lat: 33.2668,
    lng: 131.3717,
    rating: 4.4,
    icon: "camera",
  },
  {
    id: "fy5",
    placeId: "yufuin-ryokan-sansou",
    name: "Yufuin Ryokan Sansou",
    category: "Ryokan",
    color: "#F5A524",
    lat: 33.2646,
    lng: 131.3572,
    rating: 4.8,
    icon: "pin",
  },
];
