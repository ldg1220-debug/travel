import type { CourseBrief, CourseBriefSpot } from "./server/courseBrief";

/**
 * `/course/{지역}/{일수}` 공개 SSR 페이지 — 작업지시서 2026-09-18
 * "트레쥴이 구글에 7페이지만 올라가 있습니다" §4: course-brief가 이미
 * 갖고 있는 실제 코스(장소명·평점·리뷰수·구간 이동시간·지도)를 검색
 * 엔진이 색인할 수 있는 주소로 내보낸다. 순수 로직(일수 URL 라벨,
 * 1단계 공개 지역 허용목록, 얇은 콘텐츠 판정, 설명문 생성)을 여기
 * 모아 페이지 컴포넌트 없이 단위 테스트한다.
 *
 * `lib/server/`가 아니라 `lib/`에 두는 이유 — TripPostClient.tsx("use
 * client")가 후기↔코스 페이지 상호 링크(§4 "후기 페이지와 상호
 * 링크하세요")를 그리려면 ENABLED_COURSE_PAGE_REGIONS/daysToLabel이
 * 필요한데, courseBrief.ts에서 값(pool 등 DB 클라이언트를 끌고 오는
 * 런타임 코드)이 아니라 타입만 가져오므로(`import type`, 컴파일 타임에
 * 지워짐) 클라이언트 번들에 서버 전용 코드가 섞여 들어갈 위험이 없다.
 * DB 조회가 필요한 부분(관련 후기 목록)은 별도로 lib/server/coursePageLinks.ts에 둔다.
 */

export const COURSE_PAGE_DAY_LABELS: Record<string, 1 | 2 | 3> = {
  당일치기: 1,
  "1박2일": 2,
  "2박3일": 3,
};

export function daysToLabel(days: 1 | 2 | 3): string {
  return days === 1 ? "당일치기" : days === 2 ? "1박2일" : "2박3일";
}

/** URL 세그먼트("2박3일" 등)를 courseBrief가 받는 days(1|2|3)로 되돌린다 — 모르는 라벨이면 null. */
export function labelToDays(label: string): 1 | 2 | 3 | null {
  return COURSE_PAGE_DAY_LABELS[label] ?? null;
}

// 작업지시서 §5 — "한꺼번에 594개(198지역×3일수)를 내지 마세요.
// maeilg.com의 미색인 216 > 색인 170이 바로 그 신호입니다." 1단계는
// 국내 상위 20개 지역 × 2박3일(days=3)만 공개한다. 지역 목록은
// discoverData.ts의 flatRegions("domestic")(실제 course-brief가 지원하는
// 61곳) 중 여행 검색 수요가 높은 곳을 골랐다 — 지시서가 특정 20곳을
// 지목하지 않아 이 세션의 판단이다. 2단계(일수 확장)·3단계(해외 확장)는
// 색인 추이를 본 뒤 이 배열만 넓히면 된다 — 라우트·렌더링은 그대로다.
//
// (region, days) 쌍의 명시적 목록이다 — 작업지시서 2026-09-22 "sitemap에
// 올린 코스 페이지 20개가 전부 404입니다" §3 이전엔 지역 배열과 일수
// 배열의 곱집합(region×days 전부 조합)이었는데, flatRegions("domestic")의
// `parent`(서울·부산·제주·인천 등 9개 광역명)가 실측으로 확인된 건
// days=2뿐이라(§3 "course-brief?region=서울&days=2 → 200") 기존 20곳
// (days=3)과 같은 일수로 묶을 수 없었다. 이 배열이 실제로 검증된
// (region, days) 조합만 담고, days별 그룹 짓기는 아래 파생값들이 한다.
export interface EnabledCoursePage {
  region: string;
  days: 1 | 2 | 3;
}

export const ENABLED_COURSE_PAGES: readonly EnabledCoursePage[] = [
  ...(
    [
      "경주",
      "강릉",
      "속초",
      "여수",
      "순천",
      "통영",
      "거제",
      "전주",
      "제주시",
      "서귀포",
      "애월",
      "성산",
      "중문",
      "해운대",
      "광안리",
      "남포동",
      "춘천",
      "남해",
      "포항",
      "안동",
    ] as const
  ).map((region) => ({ region, days: 3 as const })),
  // 작업지시서 §3 — flatRegions("domestic")의 `.name`(구체 지역)만 보고
  // 고른 위 20곳엔 검색량이 가장 큰 광역명(`.parent`) 넷이 빠져 있었다.
  // course-brief는 이 광역명도 그대로 받아 실제 그 지역 스팟으로 응답한다
  // (실측: 서울→영등포전통시장·이랜드크루즈, 부산→자갈치시장·초량밀면,
  // 제주→서귀포매일올레시장·용머리해안, 인천→신포국제시장·코스모40 —
  // "발리"류 오매칭 없음). 지시서가 실측한 일수(days=2, 1박2일)만 켠다 —
  // days=3은 이 세션에서 검증하지 않았다.
  { region: "서울", days: 2 },
  { region: "부산", days: 2 },
  { region: "제주", days: 2 },
  { region: "인천", days: 2 },
];

/** ENABLED_COURSE_PAGES에서 뽑은 고유 지역명 — matchEnabledCourseRegion(일수와 무관하게 지역만 필요)과 클라이언트 상호 링크에 쓴다. */
export const ENABLED_COURSE_PAGE_REGIONS: readonly string[] = Array.from(new Set(ENABLED_COURSE_PAGES.map((p) => p.region)));

export function isCoursePageEnabled(region: string, days: number): boolean {
  return ENABLED_COURSE_PAGES.some((p) => p.region === region && p.days === days);
}

/**
 * 후기 제목에서 공개된 코스 페이지 지역명을 찾는다 — 작업지시서 §4
 * "후기 페이지와 상호 링크하세요"의 후기→코스 방향. trip_posts엔
 * "경주" 같은 구체적 지역명을 담는 구조화된 컬럼이 없어(region은
 * domestic/international 두 값뿐) 제목 텍스트에서 찾는 휴리스틱이다 —
 * coursePageLinks.ts의 SQL ILIKE와 같은 전제(제목에 지역명이 있다)를
 * 반대 방향으로 쓴다. 여러 개 매치되면 제목에 먼저 나오는 지역을
 * 우선한다.
 */
export function matchEnabledCourseRegion(title: string): string | null {
  let best: { region: string; index: number } | null = null;
  for (const region of ENABLED_COURSE_PAGE_REGIONS) {
    const index = title.indexOf(region);
    if (index !== -1 && (best == null || index < best.index)) best = { region, index };
  }
  return best?.region ?? null;
}

// 작업지시서 §5 "데이터가 얇으면 만들지 마세요 — 스팟 5곳 미만·평점 없는
// 곳이 절반 이상 → 그 조합은 페이지를 만들지 않음. 없는 페이지가 나쁜
// 페이지보다 낫습니다."
export function isCourseBriefThin(spots: CourseBriefSpot[]): boolean {
  if (spots.length < 5) return true;
  const unrated = spots.filter((s) => s.rating == null).length;
  return unrated / spots.length >= 0.5;
}

/**
 * 페이지 리드 문단/메타 description에 쓸 소개 문장 — 작업지시서 §5
 * "설명문을 템플릿 문장으로 찍으면 블로그와 같은 결과가 난다"에 대한
 * 대응. course-brief 계약엔 리뷰 원문이 없어(장소별 placeId조차 없음)
 * 지시서가 원한 "리뷰 근거 인용"은 이 라운드에서 못 만든다 — 대신 지역별로
 * 실제로 달라지는 값(스팟 수·총 거리·최고 평점 스팟명과 평점·리뷰수)을
 * 그대로 조합해 지역명만 바뀌는 빈칸 채우기가 되지 않게 한다.
 */
export function buildCourseIntro(brief: Pick<CourseBrief, "region" | "days" | "totalDistanceKm" | "spots">): string {
  const daysLabel = daysToLabel(brief.days);
  const stats = `${brief.region} ${daysLabel} 코스 — ${brief.spots.length}곳 · 총 이동 ${brief.totalDistanceKm.toFixed(1)}km`;
  const rated = brief.spots.filter((s): s is CourseBriefSpot & { rating: number } => s.rating != null);
  if (rated.length === 0) return `${stats}.`;
  const top = rated.reduce((best, s) => (s.rating > best.rating ? s : best));
  const reviewPart = top.reviewCount != null ? `(리뷰 ${top.reviewCount.toLocaleString()}개)` : "";
  return `${stats}. 방문자 평점 ${top.rating.toFixed(1)}점${reviewPart}인 ${top.name}을(를) 포함해 실제 평점·리뷰 기준으로 짰습니다.`;
}

/** 스팟 하나를 소개하는 짧은 문장 — 다음 스팟까지 이동시간이 있으면 그 정보도 붙인다. */
export function buildSpotDescription(spot: CourseBriefSpot): string {
  const ratingPart = spot.rating != null ? `평점 ${spot.rating.toFixed(1)}${spot.reviewCount != null ? `(리뷰 ${spot.reviewCount.toLocaleString()}개)` : ""}` : "평점 정보 없음";
  const nextPart = spot.toNextMinutes != null ? ` 다음 장소까지 ${spot.toNextMode === "walk" ? "도보" : spot.toNextMode === "transit" ? "대중교통" : "차량"}로 약 ${spot.toNextMinutes}분.` : "";
  return `${spot.category} · ${ratingPart}.${nextPart}`;
}

/**
 * 작업지시서 §4 "JSON-LD ItemList(장소 순서) + TouristTrip" — 순수 객체
 * 생성부만 여기 두고 페이지 컴포넌트는 JSON.stringify해 <script
 * type="application/ld+json">에 넣기만 한다.
 */
export function buildCourseItemListJsonLd(brief: Pick<CourseBrief, "spots">): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: brief.spots.map((spot) => ({
      "@type": "ListItem",
      position: spot.order,
      item: {
        "@type": "TouristAttraction",
        name: spot.name,
        ...(spot.rating != null && spot.reviewCount != null
          ? { aggregateRating: { "@type": "AggregateRating", ratingValue: spot.rating, reviewCount: spot.reviewCount } }
          : {}),
      },
    })),
  };
}

export function buildCourseTouristTripJsonLd(
  brief: Pick<CourseBrief, "region" | "days" | "spots" | "imageUrl">,
  description: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: `${brief.region} ${daysToLabel(brief.days)} 코스`,
    description,
    ...(brief.imageUrl ? { image: brief.imageUrl } : {}),
    itinerary: buildCourseItemListJsonLd(brief),
  };
}
