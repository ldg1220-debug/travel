import { put } from "@vercel/blob";
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
 */
export function buildPlanMapSpotsAndPaths(items: ItineraryItem[]): { spots: { order: number; lat: number; lng: number }[]; mapPaths: string[] } {
  const dates = [...new Set(items.map((i) => i.date))].sort();
  const spots: { order: number; lat: number; lng: number }[] = [];
  const mapPaths: string[] = [];
  let order = 1;
  dates.forEach((date, dayIndex) => {
    const dayItems = items.filter((i) => i.date === date).sort((a, b) => a.time.localeCompare(b.time));
    for (const item of dayItems) {
      spots.push({ order: order++, lat: item.coordinates.lat, lng: item.coordinates.lng });
    }
    // 날짜가 바뀌는 경계는 잇지 않는다 — course-brief의 같은 규칙과
    // 이유(서로 다른 날 방문지를 선으로 잇는 게 의미가 없다).
    for (let i = 0; i + 1 < dayItems.length; i++) {
      const path = mapPathParam([dayItems[i].coordinates, dayItems[i + 1].coordinates]);
      mapPaths.push(recolorMapPathForDay(path, dayIndex));
    }
  });
  return { spots, mapPaths };
}

const MAP_CALL_TIMEOUT_MS = 5000;

/**
 * generateCourseMapImage(courseBrief.ts)와 같은 Blob 캐시 패턴 — shareToken
 * 하나당 고정 경로에 addRandomSuffix:false로 덮어써서, 계획이 다시 열릴
 * 때마다 새 Blob이 쌓이지 않는다(계획이 바뀌면 같은 자리에 새 지도로
 * 갱신된다).
 */
export async function generatePlanMapImage(shareToken: string, items: ItineraryItem[]): Promise<string | null> {
  if (items.length === 0) return null;
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return null;

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
    const pathname = `plan-maps/${shareToken}.png`;
    await put(pathname, bytes, { access: "private", contentType: "image/png", addRandomSuffix: false });
    // put()의 반환 url은 private blob이라 브라우저에서 401 — course-brief와
    // 같은 이유로 우리 프록시 경로(/api/blob/...)를 대신 반환한다.
    return `https://www.tradule.co.kr/api/blob/${pathname.split("/").map(encodeURIComponent).join("/")}`;
  } catch (err) {
    console.error("[planMapImage] generation failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
