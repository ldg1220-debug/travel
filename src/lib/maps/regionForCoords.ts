/**
 * South Korea's territory approximated as several small bounding boxes
 * (mainland + 제주 + 울릉도 + 독도) rather than one big rectangle spanning
 * min/max lat/lng — a single box wide enough to reach 독도(131.87E) at
 * 제주's latitude(33.0N) also swallows all of northern Kyushu, Japan
 * (e.g. 후쿠오카 33.60N/130.41E), which made overseas 규슈 places render
 * with the Kakao engine (blank, since Kakao has no tiles outside Korea).
 * Used to decide Kakao vs Google map rendering per place, purely from its
 * own coordinates — coordinate-based rather than trusting each screen's
 * own domestic/overseas toggle state, so the two can never disagree (e.g.
 * a saved place viewed from a screen whose toggle happens to be on the
 * other setting).
 */
const KOREA_BOXES = [
  { minLat: 33.0, maxLat: 38.9, minLng: 124.5, maxLng: 129.65 }, // 본토 (동쪽 끝: 울산 간절곶 ~129.56E)
  { minLat: 33.1, maxLat: 33.6, minLng: 126.0, maxLng: 126.99 }, // 제주도
  { minLat: 37.4, maxLat: 37.6, minLng: 130.8, maxLng: 131.0 }, // 울릉도
  { minLat: 37.1, maxLat: 37.3, minLng: 131.8, maxLng: 132.0 }, // 독도
];

export function isDomesticCoordinate(lat: number, lng: number): boolean {
  return KOREA_BOXES.some((box) => lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng);
}
