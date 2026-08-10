/**
 * Parses `lat`/`lng` query params into a bias point for /api/places/search's
 * "내 주변순" — the coordinate the browser's Geolocation API resolved
 * client-side (never stored; used only for the one request that sent it).
 * `URLSearchParams`가 아니라 route.ts 밖으로 뺀 건 (1) route.ts는 Next.js
 * route handler라 HTTP 메서드 외 export를 늘리지 않으려는 것도 있지만,
 * (2) 여기서 실제 프로덕션 버그가 났던 자리라 유닛테스트로 고정해두고
 * 싶어서다.
 *
 * 버그: `searchParams.get("lat")`은 파라미터가 없으면 `null`을 주는데,
 * `Number(null)`은 JS에서 `NaN`이 아니라 **0**으로 강제변환된다. 그래서
 * `lat`/`lng`를 아예 안 보낸 요청(대부분의 일반 검색이 그렇다 —
 * PlacesSearchInput은 위치를 안 보낸다)도 `{lat:0,lng:0}`(기니만 앞바다)
 * 이라는 "유효한" 좌표로 오인돼 위치 기반 분기(x/y/radius/sort=distance)를
 * 계속 타고 있었다. "경복궁" 검색에 실제 경복궁(Kakao 원본 응답 1위,
 * AT4=관광명소)이 있는데도 (0,0) 기준 거리 정렬 때문에 순위 밖으로 밀려나
 * 사라지는 문제가 이거였다 — Kakao API도 후보군도 처음부터 정상이었다
 * (프로덕션 라이브 재검증으로 확정, 2026-08-10). "성산일출봉" 검색에
 * 서울/경남 결과가 뜬 것도 같은 원인: (0,0)에서는 한국 전역이 사실상
 * 등거리라 거리 정렬이 무의미한 잡음이 되어 키워드 관련성이 뭉개진다.
 */
export function parseUserLocation(searchParams: URLSearchParams): { lat: number; lng: number } | null {
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  // Number()에 넘기기 전에 파라미터 부재부터 걸러야 한다 — 이게 이번
  // 버그의 핵심이었다.
  if (latRaw === null || lngRaw === null) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  // (0,0)은 실사용 GPS로는 나올 수 없는 값이므로, lat/lng가 명시적으로
  // 왔더라도 방어적으로 한 번 더 걸러 같은 사고가 다른 경로로 재발하는
  // 걸 막는다(예: 클라이언트가 초기값을 0으로 잘못 넘기는 경우).
  if (lat === 0 && lng === 0) return null;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
