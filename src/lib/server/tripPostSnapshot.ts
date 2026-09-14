import { pool } from "@/lib/server/db";
import type { CourseSnapshot } from "@/lib/types";

/**
 * 후기 코스 스냅샷을 언제 (다시) 찍어야 하는지 — 작업지시서 2026-09-14
 * "후기에 코스 스냅샷 저장 + 담아가기" §3: "후기 작성 시점의 계획을 그대로
 * 복사"가 핵심이라, 같은 계획에 계속 연결된 채로 후기 본문만 고치는
 * 일반적인 재저장은 스냅샷을 다시 찍지 않는다(원본 계획이 그 사이 고쳐져
 * 있어도 예전 스냅샷을 그대로 지킨다 — "원본 계획 수정 → 후기는 그대로").
 * 처음 연결되거나(oldItineraryId가 null) 다른 계획으로 바뀔 때만 새로
 * 찍는다.
 *
 * `src/app/api/trip-posts/route.ts`에 두지 않고 여기로 뺐다 — 그 파일은
 * `@/auth`(next-auth)를 임포트해서 vitest 환경에서 그대로 직접 불러오면
 * `next/server` 해석 오류가 난다. 순수 정책 로직만 분리해두면 단위
 * 테스트가 가능하다(이 세션의 "테스트하기 쉬운 순수 함수 분리" 관례 그대로).
 */
export function shouldRefreshSnapshot(oldItineraryId: number | null, newItineraryId: number | null, hasExistingSnapshot: boolean): boolean {
  if (newItineraryId == null) return false; // 계획 연결이 없으면 찍을 것도 없다(호출부가 별도로 null 처리)
  if (oldItineraryId !== newItineraryId) return true; // 새로 연결되거나 다른 계획으로 바뀜
  return !hasExistingSnapshot; // 같은 계획 그대로 — 스냅샷이 아직 없을 때만(마이그레이션 이전 행 등) 채워 넣는다
}

/** itineraryId가 가리키는(그리고 이 유저 소유인) 계획을 후기용 스냅샷 형태로 얼린다. 소유자가 아니면(엉뚱한 계획 id) null — 남의 계획을 몰래 스냅샷할 수 없다. */
export async function computeCourseSnapshot(userId: number, itineraryId: number): Promise<CourseSnapshot | null> {
  const result = await pool.query<CourseSnapshot>(
    `select title, region, "placesData" as items from itineraries where id = $1 and "userId" = $2`,
    [itineraryId, userId],
  );
  return result.rows[0] ?? null;
}
