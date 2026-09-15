/**
 * 동선(구간·날짜)마다 돌려쓰는 색상 팔레트 — 작업지시서 2026-09-15 "공유
 * 품질 4건" §3: 계획 지도의 모든 구간이 전부 같은 검정 실선이라 1→2→3→4가
 * 겹쳐 지날 때 어느 게 어느 구간인지 구분이 안 됐다. 실측 스크린샷 기준
 * 진단 — 계획 탭(PlannerGoogleMap.tsx/PlannerKakaoMap.tsx)은 한 번에
 * 하루치 일정만 보여주므로 거기서는 이 팔레트를 "구간(leg) 인덱스"로
 * 돌려쓰고, course-brief 정적 지도(courseBrief.ts)나 공유 지도 이미지
 * (og:image)처럼 여러 날짜가 한 이미지에 같이 그려지는 곳에서는 "날짜
 * 인덱스"로 돌려쓴다 — 어느 쪽이든 같은 팔레트·같은 순서를 써서 앱
 * 전체에서 "몇 번째"가 항상 같은 색으로 보이게 한다.
 *
 * 파란색을 팔레트 첫 번째로 둔 건 우연이 아니다 — course-brief의 기존
 * 단색 폴리라인이 파랑(0x0000ffcc)이었으므로, 구간/날짜가 하나뿐인 경우
 * (지금까지의 동작)는 그대로 파랑으로 남아 시각적 회귀가 없다.
 */
export const ROUTE_LEG_COLORS_HEX = [
  "#2563eb", // blue
  "#16a34a", // green
  "#ea580c", // orange
  "#9333ea", // purple
  "#dc2626", // red
  "#0891b2", // teal
  "#ca8a04", // amber
  "#db2777", // pink
] as const;

/** index를 팔레트 길이로 순환시켜 hex 색상(지도 SDK의 strokeColor 등에 바로 쓸 수 있는 "#rrggbb")을 돌려준다. */
export function routeLegColorHex(index: number): string {
  return ROUTE_LEG_COLORS_HEX[index % ROUTE_LEG_COLORS_HEX.length];
}

/**
 * Google Static Maps의 path=color: 파라미터 형식("0xRRGGBBAA")으로 변환한다
 * — 기존 course-brief 코드가 이미 이 형식(0x0000ffcc, 80% 불투명)을 쓰고
 * 있어 그대로 맞춘다.
 */
export function routeLegColorStaticParam(index: number): string {
  const hex = routeLegColorHex(index).slice(1);
  return `0x${hex}cc`;
}
