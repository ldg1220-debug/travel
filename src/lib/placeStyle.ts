import type { PlaceIcon } from "./types";

const CATEGORY_ICON: Record<string, PlaceIcon> = {
  Cafe: "coffee",
  Museum: "museum",
  Park: "tree",
  Harbor: "boat",
  Restaurant: "utensils",
  Viewpoint: "camera",
};

const DEFAULT_ICON: PlaceIcon = "pin";

/**
 * Distinct, high-contrast colors to hash a place id into. Color used to be
 * keyed by category, but real Google/Kakao categories (Korean labels,
 * Google `primaryType` strings like "tourist_attraction") never matched the
 * handful of legacy English category keys this map only ever covered
 * ("Cafe"/"Museum"/...), so every real search result silently collapsed to
 * the same gray DEFAULT_STYLE — which is why itinerary items all looked
 * identical. Hashing by id instead guarantees every place gets its own
 * stable color, independent of what category string it happens to carry.
 */
const PALETTE = [
  "#FF6B6B",
  "#4A90E2",
  "#22B07D",
  "#F5A524",
  "#A855F7",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#84CC16",
  "#0EA5E9",
  "#E11D48",
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return hash;
}

/** Deterministic color for a place id — same id always maps to the same color. */
export function colorForId(id: string): string {
  if (!id) return "#64748B";
  return PALETTE[hashString(id) % PALETTE.length];
}

export function styleForCategory(category: string, id = ""): { color: string; icon: PlaceIcon } {
  return { color: colorForId(id), icon: CATEGORY_ICON[category] ?? DEFAULT_ICON };
}
