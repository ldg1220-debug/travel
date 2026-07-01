import type { Place } from "./types";

const EARTH_RADIUS_METERS = 6371000;

/** Great-circle distance between two coordinates, in meters. */
export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Projects lat/lng onto a padded 0-100 percentage box, purely for the
 * offline decorative fallback map (no Google Maps API key configured).
 */
export function projectPlacesToPercent(
  places: Place[],
): Record<string, { x: number; y: number }> {
  if (places.length === 0) return {};
  const lats = places.map((p) => p.lat);
  const lngs = places.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 1;
  const lngSpan = maxLng - minLng || 1;
  const pad = 20;
  const usable = 100 - pad * 2;

  const result: Record<string, { x: number; y: number }> = {};
  for (const p of places) {
    const x = pad + ((p.lng - minLng) / lngSpan) * usable;
    // Latitude increases upward, screen y increases downward.
    const y = pad + (1 - (p.lat - minLat) / latSpan) * usable;
    result[p.id] = { x, y };
  }
  return result;
}
