/**
 * Rough South Korea bounding box (includes 제주/울릉도/독도) — used to decide
 * Kakao vs Google map rendering per place, purely from its own coordinates.
 * Coordinate-based rather than trusting each screen's own domestic/overseas
 * toggle state, so the two can never disagree (e.g. a saved place viewed
 * from a screen whose toggle happens to be on the other setting).
 */
const KOREA_BOUNDS = { minLat: 33.0, maxLat: 38.9, minLng: 124.5, maxLng: 132.0 };

export function isDomesticCoordinate(lat: number, lng: number): boolean {
  return lat >= KOREA_BOUNDS.minLat && lat <= KOREA_BOUNDS.maxLat && lng >= KOREA_BOUNDS.minLng && lng <= KOREA_BOUNDS.maxLng;
}
