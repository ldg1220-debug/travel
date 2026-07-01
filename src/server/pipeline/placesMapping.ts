import type { ResolvedPlace } from "./types";

// Minimal field mask — only what the app renders (id, name, coords, rating).
// Keeping this narrow is what keeps Places API calls in the cheapest SKU.
const FIELD_MASK = "places.id,places.displayName,places.location,places.rating";

/**
 * Step 4 — Place mapping.
 *
 * Resolves a scraped place-name guess to a stable Google `place_id` +
 * coordinates via the Places API (New) Text Search endpoint. Without
 * GOOGLE_PLACES_API_KEY configured, resolves against a small offline
 * fixture so the pipeline can run end to end in this environment.
 */
export async function resolvePlace(nameGuess: string): Promise<ResolvedPlace | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return OFFLINE_FIXTURES[nameGuess] ?? null;

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: `${nameGuess} Kyoto` }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text?: string };
      location?: { latitude: number; longitude: number };
      rating?: number;
    }>;
  };
  const place = data.places?.[0];
  if (!place?.location) return null;

  return {
    placeId: place.id,
    name: place.displayName?.text ?? nameGuess,
    lat: place.location.latitude,
    lng: place.location.longitude,
    rating: place.rating,
  };
}

const OFFLINE_FIXTURES: Record<string, ResolvedPlace> = {
  "Nishiki Teahouse": {
    placeId: "ChIJTfake10sHAWARnishikiTeahouseX",
    name: "Nishiki Teahouse",
    lat: 35.0053,
    lng: 135.7645,
    rating: 4.6,
  },
  "Arashiyama Bamboo Walk": {
    placeId: "ChIJTfake11sHAWARarashiyamaBambooX",
    name: "Arashiyama Bamboo Walk",
    lat: 35.0169,
    lng: 135.6717,
    rating: 4.8,
  },
  "Kiyomizu Night Overlook": {
    placeId: "ChIJTfake12sHAWARkiyomizuOverlookX",
    name: "Kiyomizu Night Overlook",
    lat: 34.9949,
    lng: 135.785,
    rating: 4.7,
  },
  "Biwako Boathouse": {
    placeId: "ChIJTfake13sHAWARbiwakoBoathouseX",
    name: "Biwako Boathouse",
    lat: 35.0212,
    lng: 135.8586,
    rating: 4.5,
  },
};
