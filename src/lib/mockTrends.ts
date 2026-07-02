import type { Place } from "./types";

export interface TrendCard {
  id: string;
  hashtag: string;
  place: Place;
}

/**
 * Mock "trend curation" feed for the /planner screen — stands
 * in for a real self-hosted DB of hashtag-filtered SNS posts (see
 * src/server/pipeline for the actual scrape → regex-filter → LLM-verify →
 * Places-resolve pipeline the main app uses for its international list).
 */
export const TREND_CARDS: TrendCard[] = [
  {
    id: "trend-1",
    hashtag: "#텐진내돈내산맛집",
    place: {
      id: "trend-tenjin-izakaya",
      placeId: "trend-tenjin-izakaya",
      name: "Tenjin Backstreet Izakaya",
      category: "Restaurant",
      color: "#FF6B6B",
      lat: 33.592,
      lng: 130.401,
      rating: 4.6,
      icon: "utensils",
    },
  },
  {
    id: "trend-2",
    hashtag: "#유후인료칸추천",
    place: {
      id: "trend-yufuin-ryokan-2",
      placeId: "trend-yufuin-ryokan-2",
      name: "Yufuin Onsen Ryokan Kaze",
      category: "Ryokan",
      color: "#F5A524",
      lat: 33.2701,
      lng: 131.3543,
      rating: 4.9,
      icon: "pin",
    },
  },
  {
    id: "trend-3",
    hashtag: "#다자이후텐만구인생샷",
    place: {
      id: "trend-dazaifu-tenmangu",
      placeId: "trend-dazaifu-tenmangu",
      name: "Dazaifu Tenmangu",
      category: "Viewpoint",
      color: "#EC4899",
      lat: 33.5219,
      lng: 130.5352,
      rating: 4.7,
      icon: "camera",
    },
  },
  {
    id: "trend-4",
    hashtag: "#모지코레트로야경",
    place: {
      id: "trend-mojiko-retro",
      placeId: "trend-mojiko-retro",
      name: "Mojiko Retro Waterfront",
      category: "Viewpoint",
      color: "#8B5CF6",
      lat: 33.9483,
      lng: 130.9631,
      rating: 4.5,
      icon: "camera",
    },
  },
  {
    id: "trend-5",
    hashtag: "#하카타포장마차투어",
    place: {
      id: "trend-hakata-yatai",
      placeId: "trend-hakata-yatai",
      name: "Hakata Yatai Row",
      category: "Restaurant",
      color: "#FF6B6B",
      lat: 33.5933,
      lng: 130.4181,
      rating: 4.4,
      icon: "utensils",
    },
  },
  {
    id: "trend-6",
    hashtag: "#긴린코호수산책",
    place: {
      id: "trend-kinrinko-lake",
      placeId: "trend-kinrinko-lake",
      name: "Kinrin Lake",
      category: "Park",
      color: "#22B07D",
      lat: 33.266,
      lng: 131.3733,
      rating: 4.8,
      icon: "tree",
    },
  },
];
