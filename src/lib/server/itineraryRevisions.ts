import { pool } from "./db";

/**
 * 계획 하나당 되돌리기 이력을 몇 개까지 남길지 — 작업지시서 2026-09-16
 * "계획 덮어쓰기가 재발했습니다" §3-③에서 itinerary_revisions 테이블을
 * 만들 때 정한 상한. id 기반 저장(POST /api/itineraries)과 이력 복원
 * (POST /api/itineraries/[id]/revisions/[revisionId]/restore) 둘 다
 * "덮어쓰기 직전 내용을 남기고 상한을 넘는 오래된 것부터 정리"하는 같은
 * 패턴을 쓰므로, 중복을 피해 한 곳에 모은다.
 */
export const MAX_REVISIONS_PER_ITINERARY = 20;

/**
 * itineraries 행을 덮어쓰기 직전, 지금 내용을 이력에 남기고 상한을 넘는
 * 오래된 이력부터 정리한다. 호출부(POST /api/itineraries의 id 갱신 경로,
 * 이력 복원 라우트)가 "덮어쓰기 전에는 항상 이걸 부른다"는 규칙만
 * 지키면, 복원 자체도 다시 되돌릴 수 있는 이력으로 남는다.
 *
 * createdBy — 작업지시서 2026-09-18 §7: 되돌리기(restore route)가 남기는
 * "덮어써지기 직전 상태" 스냅샷과 평소 저장이 남기는 스냅샷을 구분해,
 * 목록에서 "왜 이 항목이 여기 있는지"를 알 수 있게 한다.
 */
export async function snapshotItineraryRevision(
  itineraryId: number,
  title: string,
  region: string,
  placesData: unknown,
  createdBy: "save" | "restore" = "save",
): Promise<void> {
  await pool.query(
    `insert into itinerary_revisions ("itineraryId", title, region, "placesData", "createdBy") values ($1, $2, $3, $4, $5)`,
    [itineraryId, title, region, JSON.stringify(placesData), createdBy],
  );
  await pool.query(
    `delete from itinerary_revisions where "itineraryId" = $1 and id not in (
       select id from itinerary_revisions where "itineraryId" = $1 order by created_at desc limit $2
     )`,
    [itineraryId, MAX_REVISIONS_PER_ITINERARY],
  );
}
