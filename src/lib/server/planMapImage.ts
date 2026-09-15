import { head, put } from "@vercel/blob";
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
 * 이 계획의 og:image가 저장될 자리 — updated_at(ms epoch)을 경로에 포함해,
 * 계획이 수정되면 자동으로 "새 경로"가 되어 캐시가 무효화된다(작업지시서
 * 2026-09-15 "og:image가 404입니다" §2 "계획이 수정되면 무효화 —
 * updated_at을 캐시 키에 포함"). 옛 경로의 blob은 명시적으로 지우지
 * 않는다 — course-open의 "고아가 된 옛 콘텐츠 행"과 같은 이유로, 지우는
 * 로직을 추가하는 것보다 조용히 안 쓰이게 두는 쪽이 안전하다.
 */
function planMapPathname(shareToken: string, updatedAtMs: number): string {
  return `plan-maps/${shareToken}/${updatedAtMs}.png`;
}

function blobProxyUrl(pathname: string): string {
  return `https://www.tradule.co.kr/api/blob/${pathname.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * generateCourseMapImage(courseBrief.ts)와 같은 Blob 캐시 패턴이되, 실제로
 * "이미 있으면 재사용"까지 확인한다 — 작업지시서 §2 "캐시에 없으면 그
 * 자리에서 생성한다"를 문자 그대로: head()로 이 버전(updatedAtMs)의
 * blob이 이미 있는지 먼저 확인하고, 있으면 Google Static Maps를 다시
 * 부르지 않는다(크롤러가 반복 요청해도 실제 생성은 계획이 바뀔 때마다
 * 한 번뿐). 없으면(최초 요청이거나 방금 수정됨) 새로 만든다.
 */
export async function generatePlanMapImage(shareToken: string, items: ItineraryItem[], updatedAtMs: number): Promise<string | null> {
  if (items.length === 0) return null;
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return null;

  const pathname = planMapPathname(shareToken, updatedAtMs);
  try {
    await head(pathname);
    return blobProxyUrl(pathname); // 이미 이 버전으로 생성돼 있다 — 그대로 재사용.
  } catch {
    // BlobNotFoundError(가장 흔한 경우) 포함 — 캐시 미스로 보고 아래에서 새로 만든다.
  }

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
    const bytes = Buffer.from(await res.arrayBuffer());
    await put(pathname, bytes, { access: "private", contentType: "image/png", addRandomSuffix: false });
    // put()의 반환 url은 private blob이라 브라우저에서 401 — course-brief와
    // 같은 이유로 우리 프록시 경로(/api/blob/...)를 대신 반환한다.
    return blobProxyUrl(pathname);
  } catch (err) {
    console.error("[planMapImage] generation failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
