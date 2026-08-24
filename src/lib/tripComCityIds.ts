/**
 * 트립닷컴 도시 ID 매핑 — 작업지시서(2026-08-14, "트립닷컴 제휴 링크 형식
 * 오류·긴급") 실측 시드.
 *
 * trip.com은 `/hotels/list`에 `keyword`만 주면 `city`(cityId) 없이는
 * **무조건 검색 결과 0건**을 반환한다 — 실측으로 "롯데호텔 서울"조차
 * 0건이 나온 걸로 확인됨(특정 숙소가 없어서가 아니라 URL 형식 자체가
 * 틀렸던 것). 그래서 cityId가 있는 도시만 트립닷컴 링크를 만든다.
 *
 * ⚠️ 여기 없는 도시는 절대 cityId를 추측해서 채우지 말 것 — 잘못된
 * cityId는 "링크는 열리는데 완전히 다른 도시"로 조용히 잘못 연결되는,
 * 링크가 아예 없는 것보다 나쁜 결과를 만든다. 실측(trip.com 도시 인덱스
 * 페이지의 `<a href>`에서 `-hotels-list-(\d+)` 패턴으로 직접 확인)으로만
 * 추가한다. 매핑 없는 도시는 affiliates.ts가 트립닷컴 대신 네이버 검색
 * 링크로 폴백한다.
 */
export interface TripComCity {
  id: number;
  slug: string;
  /** 한글 표기 — 이 항목의 키(TRIP_COM_CITY_IDS의 속성명)와 항상 같다.
   * 버튼 라벨("트립닷컴에서 {도시} 숙소 보기")처럼 맵의 키를 따로
   * 들고 다니기 번거로운 호출부를 위해 값 쪽에도 중복해서 둔다. */
  label: string;
}

export const TRIP_COM_CITY_IDS: Record<string, TripComCity> = {
  // 국내 — 주요 도시만 커버(김해·창원 등 중소도시는 트립닷컴에 도시
  // 페이지가 없을 가능성이 높다고 작업지시서가 명시).
  서울: { id: 274, slug: "seoul", label: "서울" },
  제주: { id: 737, slug: "jeju", label: "제주" },
  인천: { id: 410, slug: "incheon", label: "인천" },
  수원: { id: 5980, slug: "suwon", label: "수원" },
  성남: { id: 61636, slug: "seongnam", label: "성남" },
  대전: { id: 61292, slug: "daejeon", label: "대전" },
  부산: { id: 253, slug: "busan", label: "부산" },
  서귀포: { id: 35796, slug: "seogwipo", label: "서귀포" },
  // 해외
  오사카: { id: 219, slug: "osaka", label: "오사카" },
  방콕: { id: 359, slug: "bangkok", label: "방콕" },
  다낭: { id: 1356, slug: "da-nang", label: "다낭" },
  싱가포르: { id: 73, slug: "singapore", label: "싱가포르" },
  파리: { id: 192, slug: "paris", label: "파리" },
  런던: { id: 338, slug: "london", label: "런던" },
  로마: { id: 343, slug: "rome", label: "로마" },
  뉴욕: { id: 633, slug: "new-york", label: "뉴욕" },
  로스앤젤레스: { id: 347, slug: "los-angeles", label: "로스앤젤레스" },
  호놀룰루: { id: 757, slug: "honolulu", label: "호놀룰루" },
  상하이: { id: 2, slug: "shanghai", label: "상하이" },
  베이징: { id: 1, slug: "beijing", label: "베이징" },
  칭다오: { id: 7, slug: "qingdao", label: "칭다오" },
  도쿄: { id: 228, slug: "tokyo", label: "도쿄" },
  후쿠오카: { id: 248, slug: "fukuoka", label: "후쿠오카" },
  광저우: { id: 32, slug: "guangzhou", label: "광저우" },
  심천: { id: 30, slug: "shenzhen", label: "심천" },
};

/**
 * 주어진 텍스트 조각들(장소명·도시 라벨·주소 등, 있는 만큼만) 안에
 * 매핑된 도시명이 하나라도 포함돼 있으면 그 cityId를 반환한다. 텍스트
 * 전체를 정확한 도시명으로 파싱하는 게 아니라 부분 문자열 포함만 보는
 * 이유는, 호출부마다 넘어오는 텍스트 형태가 제각각이라(도시명 그 자체,
 * "경남 창원시 마산합포구 ..." 같은 전체 주소 등) 하나의 엄격한 파서로
 * 다 처리하기 어렵기 때문 — 오탐 위험은 매핑 테이블 자체가 짧고 서로
 * 겹치지 않는 이름들이라 낮다.
 */
export function resolveTripComCity(...hints: (string | undefined)[]): TripComCity | null {
  const joined = hints.filter(Boolean).join(" ");
  for (const [name, city] of Object.entries(TRIP_COM_CITY_IDS)) {
    if (joined.includes(name)) return city;
  }
  return null;
}
