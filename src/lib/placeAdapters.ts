import { styleForCategory } from "./placeStyle";
import type { Place } from "./types";

/**
 * Converts a Google Places (New) JS SDK `Place` — after a scoped
 * `fetchFields({ fields: ["displayName", "location", "id", "types"] })`
 * call — into the app's shared `Place` shape
 * (`id, name, category, color, lat, lng, icon`), the same structure every
 * other place source (trend cards, mock seeds, search) produces.
 */
export function placeFromGoogleDetails(googlePlace: google.maps.places.Place): Place {
  const category = googlePlace.types?.[0] ?? "place";
  const { color, icon } = styleForCategory(titleCase(category));
  const lat = googlePlace.location?.lat() ?? 0;
  const lng = googlePlace.location?.lng() ?? 0;

  return {
    id: googlePlace.id,
    placeId: googlePlace.id,
    name: googlePlace.displayName ?? "Unknown place",
    category: titleCase(category),
    color,
    lat,
    lng,
    icon,
  };
}

function titleCase(snakeCaseType: string): string {
  return snakeCaseType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
