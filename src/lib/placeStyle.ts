import type { PlaceIcon } from "./types";

const CATEGORY_STYLE: Record<string, { color: string; icon: PlaceIcon }> = {
  Cafe: { color: "#FF6B6B", icon: "coffee" },
  Museum: { color: "#4A90E2", icon: "museum" },
  Park: { color: "#22B07D", icon: "tree" },
  Harbor: { color: "#F5A524", icon: "boat" },
  Restaurant: { color: "#A855F7", icon: "utensils" },
  Viewpoint: { color: "#EC4899", icon: "camera" },
};

const DEFAULT_STYLE = { color: "#64748B", icon: "pin" as PlaceIcon };

export function styleForCategory(category: string): { color: string; icon: PlaceIcon } {
  return CATEGORY_STYLE[category] ?? DEFAULT_STYLE;
}
