import {
  buildStaticMapUrl,
  computeViewport,
  excludeOutlierSpots,
  fetchLegRoute,
  mapPathParam,
  mapPathParamEncoded,
  mapWithConcurrency,
  recolorMapPathAsEstimated,
  type LegRouteResult,
  type MapViewport,
} from "./courseBrief";
import type { ItineraryItem } from "@/lib/types";

/**
 * 저장된 계획(itineraries."placesData")의 좌표로 course-brief와 같은
 * 방식(buildStaticMapUrl)의 정적 지도를 만든다 — 작업지시서 2026-09-15
 * "공유 품질 4건" §1: 공유 링크(/planner/{shareToken})의 카카오톡 공유
 * 카드에 og:image가 없어 썸네일이 안 떴다.
 *
 * 작업지시서 2026-09-15 "OG 이미지 구도 3건" §3-①: 전 일정을 한 장에
 * 담으면(후쿠오카~유후인~아프리칸사파리처럼 넓게 퍼진 계획) 축척이
 * 무너져 도심 스팟 여러 개가 한 점으로 뭉친다. og:image는 "대표 한 장"
 * 역할이고 다일정 전체는 이미 9:16 스토리 이미지가 맡고 있으므로,
 * 스팟이 가장 많은 하루만 골라 그린다 — 그 날이 화면을 꽉 채운다.
 *
 * 작업지시서 2026-09-15 "OG 지도 잔여 2건" §2: 대표 하루 "안에도" 도심에서
 * 멀리 떨어진 단독 방문지가 섞이면(후쿠오카 예: 도심 6곳 + 15km 밖
 * 다자이후 1곳) 그 하나 때문에 화면 축척이 다시 무너진다. excludeOutlierSpots로
 * 걸러낸 "핵심 군집" 기준으로 center/zoom(viewport)을 따로 계산해
 * buildStaticMapUrl에 넘긴다 — 이상치 스팟도 markers=엔 그대로 남아 좌표는
 * 정확하지만(화면 밖이면 안 보여도 된다는 게 지시서 판단), 보이는 화면만
 * 도심에 맞춘다.
 */
export function buildPlanMapSpots(items: ItineraryItem[]): {
  spots: { order: number; lat: number; lng: number }[];
  dayItems: ItineraryItem[];
  viewport: MapViewport | null;
} {
  if (items.length === 0) return { spots: [], dayItems: [], viewport: null };
  const dates = [...new Set(items.map((i) => i.date))].sort();
  const busiestDate = dates.reduce((best, date) => {
    const count = items.filter((i) => i.date === date).length;
    const bestCount = items.filter((i) => i.date === best).length;
    return count > bestCount ? date : best;
  }, dates[0]);
  const dayItems = items.filter((i) => i.date === busiestDate).sort((a, b) => a.time.localeCompare(b.time));
  const spots = dayItems.map((item, i) => ({ order: i + 1, lat: item.coordinates.lat, lng: item.coordinates.lng }));
  const viewport = computeViewport(excludeOutlierSpots(spots));
  return { spots, dayItems, viewport };
}

const LEG_FETCH_CONCURRENCY = 4;

/**
 * 작업지시서 2026-09-15 "OG 지도 잔여 2건" §3: 계획 OG 지도의 경로선이
 * 좌표만 이은 직선이라 "다닐 수 없는 길"(하카타→다자이후 대각선 등)이
 * 그대로 카드에 나왔다. /api/routes가 그대로 쓰는 fetchLegRoute(courseBrief.ts)로
 * 대표 하루의 구간(많아야 5~7개)을 실제로 조회한다 — HTTP로 자기 자신을
 * 다시 부르는 대신 같은 서버 프로세스 안에서 함수를 직접 호출한다(같은
 * 결과, 왕복 없음). estimated:false(실제 경로)면 그대로, estimated:true
 * (경로 조회 실패/도보 직선 추정)면 회색으로 — "도보 구간이 직선으로
 * 그려집니다" 라운드에서 정한 것과 같은 규칙이다.
 *
 * fetchLeg는 테스트에서 네트워크 없이 가짜 결과를 주입하기 위한 것 —
 * planRouteForDay(courseBrief.ts)의 resolveSegment 주입과 같은 패턴.
 */
export async function fetchPlanDayRoutePaths(
  dayItems: ItineraryItem[],
  fetchLeg: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Promise<LegRouteResult> = fetchLegRoute,
): Promise<string[]> {
  if (dayItems.length < 2) return [];
  const legs = dayItems.slice(0, -1).map((item, i) => [item, dayItems[i + 1]] as const);
  const results = await mapWithConcurrency(legs, LEG_FETCH_CONCURRENCY, ([a, b]) => fetchLeg(a.coordinates, b.coordinates));
  return results.map((r, i) => {
    const [a, b] = legs[i];
    const points = r.path ?? [a.coordinates, b.coordinates];
    const rawPath = points.length > 2 ? mapPathParamEncoded(points) : mapPathParam(points);
    return r.estimated ? recolorMapPathAsEstimated(rawPath) : rawPath;
  });
}

const MAP_CALL_TIMEOUT_MS = 5000;

/**
 * 계획 og:image PNG 를 만든다 — 작업지시서 2026-10-13 "긴급: Vercel Blob 한도 초과" §3④: plan-maps/ 도 코스 지도와 같은 방식(Blob 없이 CDN)으로 전환.
 * 예전엔 계획이 수정될 때마다(updatedAtMs 가 경로에 들어가) 새 경로로 put 해 Blob Advanced Operations 를 썼다. 이제 /api/og/plan 라우트가 이
 * 함수의 PNG 를 직접 응답하고 Cache-Control(s-maxage) + ETag(updated_at)로 CDN 이 캐시한다. 실패하면 null(라우트가 사이트 기본 이미지로 302).
 */
export async function renderPlanMapPng(items: ItineraryItem[]): Promise<Buffer | null> {
  if (items.length === 0) return null;
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) return null;

  const { spots, dayItems, viewport } = buildPlanMapSpots(items);
  const mapPaths = await fetchPlanDayRoutePaths(dayItems);
  const url = buildStaticMapUrl(apiKey, spots, mapPaths, viewport ?? undefined);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAP_CALL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.error(`[planMapImage] google staticmap ${res.status} (url ${url.toString().length} chars)`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error("[planMapImage] generation failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
