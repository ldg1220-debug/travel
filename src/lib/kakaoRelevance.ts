/**
 * Kakao Local 키워드 검색 결과의 관련성 재정렬 — src/app/api/places/search/route.ts
 * 의 domestic(Kakao) 경로에서 쓴다. 별도 파일로 뺀 건 두 가지 이유: (1)
 * route.ts는 Next.js route handler 파일이라 HTTP 메서드/설정 외의 export를
 * 늘리고 싶지 않았고, (2) 순수 함수라 실제 Kakao API 호출 없이도 유닛
 * 테스트가 가능하다(kakaoRelevance.test.ts).
 *
 * 문제 사례(코스 세부설정의 시작/종료 위치 검색, 프로덕션 라이브 테스트에서
 * 발견): "경복궁" 검색 결과 1~5위가 전부 부동산중개·음식점("경복궁"이
 * 상호명에 들어간 식당)이고 실제 경복궁(관광명소)은 안 보였다. "서울역"은
 * 시청역이 먼저 나왔다. Kakao Local 키워드 검색이 리뷰 기반이 아니라
 * 문자열 매칭이라 이름에 검색어가 들어간 무관한 업소가 자주 앞서는데,
 * 그중에서도 중개업소·학원·은행 같은 카테고리는 랜드마크 검색에서 거의
 * 항상 노이즈다.
 */

/** route.ts의 KakaoLocalDocument 중 정렬에 실제로 쓰는 필드만 — 구조적 타이핑이라 그 인터페이스를 그대로 넘겨도 맞는다. */
export interface KakaoRelevanceDoc {
  place_name: string;
  category_group_code?: string;
}

/**
 * 관광명소·역 등 "장소를 찾는" 검색 의도에서 상위로 끌어올릴 카테고리,
 * 나머지(부동산중개·학원·은행 등)는 전부 하위로 민다. 숫자가 작을수록
 * 먼저 정렬됨.
 */
const KAKAO_RELEVANCE_TIER: Record<string, number> = {
  AT4: 0, // 관광명소
  SW8: 0, // 지하철역
  CT1: 1, // 문화시설
  AD5: 1, // 숙박
  FD6: 2, // 음식점
  CE7: 2, // 카페
};

export function kakaoCategoryTier(code?: string): number {
  return code ? (KAKAO_RELEVANCE_TIER[code] ?? 3) : 3;
}

/**
 * Relevance key for sorting Kakao keyword results against the query the
 * user typed — smaller sorts first. Priority order: 이름 완전일치 >
 * 이름 접두 일치 > 카테고리 등급. 이름 매칭이 카테고리보다 항상
 * 우선이라, "우래옥"처럼 진짜 상호명 검색(FD6=음식점)은 이 정렬로도
 * 여전히 1위로 남는다 — 카테고리 등급은 "경복궁"처럼 정확 매칭 후보가
 * 여럿(혹은 하나도 없이 부분 매칭만 있을) 때만 타이브레이커로 작동.
 */
export function kakaoRelevanceRank(doc: KakaoRelevanceDoc, query: string): [number, number, number] {
  const name = doc.place_name.trim();
  const q = query.trim();
  const exact = name === q ? 0 : 1;
  const prefix = name.startsWith(q) ? 0 : 1;
  return [exact, prefix, kakaoCategoryTier(doc.category_group_code)];
}

/**
 * 원래 순서(Kakao 자체 랭킹)는 세 기준(이름 완전일치/접두일치/카테고리
 * 등급)이 모두 같을 때만 유지된다 — Array.prototype.sort는 안정 정렬이라
 * 별도 처리 없이 보장됨.
 */
export function sortKakaoByRelevance<T extends KakaoRelevanceDoc>(docs: T[], query: string): T[] {
  return [...docs].sort((a, b) => {
    const ra = kakaoRelevanceRank(a, query);
    const rb = kakaoRelevanceRank(b, query);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  });
}
