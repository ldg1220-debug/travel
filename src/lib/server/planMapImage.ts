import { head, put } from "@vercel/blob";
import { buildStaticMapUrl, mapPathParam, recolorMapPathForDay } from "./courseBrief";
import type { ItineraryItem } from "@/lib/types";

/**
 * 저장된 계획(itineraries."placesData")의 좌표로 course-brief와 같은
 * 방식(buildStaticMapUrl)의 정적 지도를 만든다 — 작업지시서 2026-09-15
 * "공유 품질 4건" §1: 공유 링크(/planner/{shareToken})의 카카오톡 공유
 * 카드에 og:image가 없어 썸네일이 안 떴다.
 *
 * og:image는 크롤러(카카오톡 링크 언퍼니셔 등)가 몇 초 안에 응답을 받아야
 * 하는 썸네일이라, course-brief처럼 Kakao/Google Directions로 실제 도로
 * 경로를 조회하지 않는다 — 대신 같은 날짜 안의 연속된 스톱끼리 직선으로
 * 잇는다. 어차피 카카오톡은 OG 이미지를 캐시하므로(지시서 §1 각주) 매
 * 요청마다 정밀도를 높이는 것보다 빠르고 저렴한 쪽을 택했다.
 *
 * 작업지시서 2026-09-15 "OG 이미지 구도 3건" §3-①: 전 일정을 한 장에
 * 담으면(후쿠오카~유후인~아프리칸사파리처럼 넓게 퍼진 계획) 축척이
 * 무너져 도심 스팟 여러 개가 한 점으로 뭉친다. og:image는 "대표 한 장"
 * 역할이고 다일정 전체는 이미 9:16 스토리 이미지가 맡고 있으므로,
 * 스팟이 가장 많은 하루만 골라 그린다 — 그 날이 화면을 꽉 채운다.
 */
export function buildPlanMapSpotsAndPaths(items: ItineraryItem[]): { spots: { order: number; lat: number; lng: number }[]; mapPaths: string[] } {
  if (items.length === 0) return { spots: [], mapPaths: [] };
  const dates = [...new Set(items.map((i) => i.date))].sort();
  const busiestDate = dates.reduce((best, date) => {
    const count = items.filter((i) => i.date === date).length;
    const bestCount = items.filter((i) => i.date === best).length;
    return count > bestCount ? date : best;
  }, dates[0]);
  const dayItems = items
    .filter((i) => i.date === busiestDate)
    .sort((a, b) => a.time.localeCompare(b.time));
  const spots = dayItems.map((item, i) => ({ order: i + 1, lat: item.coordinates.lat, lng: item.coordinates.lng }));
  const mapPaths: string[] = [];
  for (let i = 0; i + 1 < dayItems.length; i++) {
    const path = mapPathParam([dayItems[i].coordinates, dayItems[i + 1].coordinates]);
    mapPaths.push(recolorMapPathForDay(path, 0));
  }
  return { spots, mapPaths };
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

  const { spots, mapPaths } = buildPlanMapSpotsAndPaths(items);
  const url = buildStaticMapUrl(apiKey, spots, mapPaths);

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
