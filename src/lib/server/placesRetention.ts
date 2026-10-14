import { pool } from "./db";

/**
 * Google Places 데이터 보관 기간 — 작업지시서 2026-10-14 "Google Places 데이터 보관 기간 점검 (약관 맞춤)".
 * Google Maps Platform Service Specific Terms(§A-3, §B-14.3, 2026-06-10 개정본) 기준:
 *   place_id 무기한 / 위도·경도 최대 30일 / 그 밖의 값(이름·평점·리뷰 수·주소·사진·영업시간·타입 …) 보관 불가.
 * 그래서 이름·평점 같은 "콘텐츠"가 들어 있는 DB 캐시는 읽기 TTL 을 26시간(= 하루 1회 워밍 크론 + 2시간 여유)으로 두고,
 * 읽기 TTL 이 지난 행은 이 모듈의 purge 가 물리적으로 지운다(읽기 쪽만 막고 행을 남겨 두면 "보관"이다).
 * 좌표만 담은 행(course-map-input)은 30일.
 */
export const PLACES_CONTENT_TTL_MS = 26 * 60 * 60 * 1000;
export const PLACES_LATLNG_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * 물리 삭제 유예 — 워밍 크론의 우선순위 정렬(pickStaleTasks)이 행의 created_at 으로 "가장 오래 안 돈 조합"을 고른다. 24시간 주기에 맞춰 도는
 * 크론이 어제 처리한 행을 지우면 순번이 무너지므로, 읽기 TTL(26h)과 별개로 2시간만 더 둔다(읽기 쪽은 이미 이 행을 쓰지 않는다).
 */
export const PLACES_CONTENT_PURGE_MS = PLACES_CONTENT_TTL_MS + 2 * 60 * 60 * 1000;

export interface PurgeResult {
  content: number;
  latLng: number;
}

/**
 * place_candidate_cache 에서 보관 기간이 지난 Places 유래 행을 지운다.
 *  - 콘텐츠(이름·평점 …): 후보 풀(`overseas:%`·`domestic:%`), 최종 브리프(`content-brief:%`), 평점 보강(`content-brief-rating:%`) — PLACES_CONTENT_PURGE_MS 초과
 *  - 좌표: 지도 입력(`course-map-input:%`) — 30일 초과
 * 사이트맵 기록(`course-sitemap:%` — 지역·일수만 있다)·`blob-ops:%`(카운터)는 Places 데이터가 아니라 건드리지 않는다.
 * 워밍 크론이 끝에 부른다(쓰기 경로의 5% 확률 청소는 보조일 뿐 — 보관 기간의 근거가 될 수 없다).
 */
export async function purgeExpiredPlacesCache(): Promise<PurgeResult> {
  const content = await pool.query(
    `delete from place_candidate_cache
      where created_at < now() - ($1 || ' milliseconds')::interval
        and (cache_key like 'overseas:%' or cache_key like 'domestic:%' or cache_key like 'content-brief:%' or cache_key like 'content-brief-rating:%')`,
    [String(PLACES_CONTENT_PURGE_MS)],
  );
  const latLng = await pool.query(
    `delete from place_candidate_cache where created_at < now() - ($1 || ' milliseconds')::interval and cache_key like 'course-map-input:%'`,
    [String(PLACES_LATLNG_TTL_MS)],
  );
  // /discover 큐레이션 지표(spot_place_metrics) — place_id 는 무기한 보관 가능, 평점 등 값은 콘텐츠라 28시간 초과 행을 지운다.
  await pool.query(`delete from spot_place_metrics where updated_at < now() - ($1 || ' milliseconds')::interval`, [String(PLACES_CONTENT_PURGE_MS)]).catch(() => undefined);
  // 방문 기록(course-visit)은 26시간 창으로만 쓰므로 7일 지난 것은 정리한다(Places 값은 없다).
  await pool.query(`delete from place_candidate_cache where created_at < now() - interval '7 days' and cache_key like 'course-visit:%'`);
  return { content: content.rowCount ?? 0, latLng: latLng.rowCount ?? 0 };
}
