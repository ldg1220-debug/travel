import { haversineDistanceMeters } from "@/lib/geo";
import type { ItineraryItem, Place } from "@/lib/types";

/**
 * 항목의 placeId 로 로컬 장소 카탈로그를 찾되, 좌표가 항목과 크게 어긋나면 다른 장소로 본다 — 작업지시서 2026-10-16 "#326 검증": 코스에서 저장된 옛 일정의
 * 합성 id(`content-0-0` …)는 계획마다 똑같아서, 이전에 본 다른 도시 코스(후쿠오카)의 같은 id 가 이 기기의 카탈로그에 남아 있으면 하노이 항목이
 * 그 장소(후쿠오카 좌표)로 해석돼 지도가 엉뚱한 도시를 보여 줬다. 좌표가 없는(0,0) 항목이면 id 일치만 믿는다.
 */
export const CATALOG_MATCH_MAX_METERS = 500;
export function catalogPlaceFor(item: ItineraryItem, places: Place[]): Place | null {
  const found = places.find((p) => p.id === item.placeId);
  if (!found) return null;
  const { lat, lng } = item.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return found;
  return haversineDistanceMeters(found, item.coordinates) <= CATALOG_MATCH_MAX_METERS ? found : null;
}

