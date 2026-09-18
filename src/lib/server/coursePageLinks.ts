import { pool } from "./db";

/**
 * 코스 페이지 ↔ 후기 상호 링크 — 작업지시서 2026-09-18 "트레쥴이
 * 구글에 7페이지만 올라가 있습니다" §4: "내부 링크가 색인을 끌어옵니다."
 *
 * trip_posts에는 "경주" 같은 구체적 지역명을 담는 구조화된 컬럼이 없다
 * (region은 "domestic"/"international" 두 값뿐) — 그래서 제목에 지역명이
 * 그대로 들어있다는 가정(title ILIKE)으로 찾는다. 완벽하지 않은 휴리스틱
 * 이지만("경주에서 하루" 같은 제목은 잡지만 지역명을 안 쓴 제목은 못
 * 잡는다), 데이터 모델을 바꾸는 것보다 훨씬 적은 변경으로 "관련 후기
 * 몇 개를 코스 페이지에 건다"는 목적은 충분히 달성한다.
 */
export interface RelatedTripPost {
  id: number;
  title: string;
}

export async function fetchRelatedTripPosts(region: string, limit = 3): Promise<RelatedTripPost[]> {
  const result = await pool.query<RelatedTripPost>(
    `select id, title from trip_posts
     where visibility = 'public' and "coursesSnapshot" is not null and title ilike '%' || $1 || '%'
     order by created_at desc
     limit $2`,
    [region, limit],
  );
  return result.rows;
}
