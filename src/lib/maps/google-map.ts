/**
 * Google Maps JS API loading config. The actual `<Script>` tag has to live
 * in a client component (src/components/map/MapProvider.tsx) — `next/script`
 * is JSX, which a plain `.ts` file can't contain — so this module holds
 * everything that *can* be plain data/logic: the API key, the script URL,
 * and a readiness check, so MapProvider.tsx doesn't hardcode any of it.
 */

export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

const GOOGLE_MAPS_LIBRARIES = ["places"] as const;

/** Classic (non-`loading=async`) script URL — its `load` event alone is a
 * reliable "google.maps is ready" signal, which keeps MapProvider.tsx's
 * next/script `onLoad` simple (no separate global callback to register). */
export function googleMapsScriptSrc(): string {
  const params = new URLSearchParams({
    key: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES.join(","),
  });
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

export function isGoogleMapsReady(): boolean {
  return typeof google !== "undefined" && Boolean(google.maps);
}
