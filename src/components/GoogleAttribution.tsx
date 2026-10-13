/**
 * 평점·리뷰 수의 Google 출처 표시 — 작업지시서 2026-10-13 "PR #316 후속: Google 출처 표시" A-1.
 * 이 서비스의 평점·리뷰 수는 Google Places 에서 가져온 값이다. Google Maps Platform 정책상 Google 지도 없이 Places 데이터를 보여줄 때는
 * Google 출처 표시가 필요하다(지도 이미지가 페이지에 있어도 평점 목록은 지도와 떨어져 있어 목록 근처에 따로 둔다).
 * 가장 단순한 텍스트 표기("Google Maps")를 쓴다 — 정확한 형식은 Places API 정책 페이지의 출처 표시 항목을 따른다(확인 필요).
 * /discover 에는 같은 취지의 인라인 표기(DiscoverClient 의 GoogleAttribution, "평점·리뷰 정보 제공: Google")가 이미 있어 그대로 둔다.
 */
export function GoogleAttribution({ className = "" }: { className?: string }) {
  return <p className={`text-[11px] text-slate-400 ${className}`.trim()}>평점·리뷰 정보 제공: Google Maps</p>;
}
