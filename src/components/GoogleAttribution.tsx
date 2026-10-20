/**
 * 평점·리뷰 수의 Google 출처 표시 — 작업지시서 2026-10-13 "PR #316 후속: Google 출처 표시" A-1, 2026-10-14 "#317 검증" 로 정책 스타일에 맞춤.
 * 이 서비스의 평점·리뷰 수는 Google Places 에서 가져온 값이다. Places API 정책(Google Maps attribution requirements)상 지도 없이 Places 내용을 보여줄 때는
 * Google Maps 로고가 원칙이고 공간이 부족하면 텍스트 "Google Maps" 도 허용된다. 텍스트 방식의 스타일 요구:
 * 12~16px · 색 #1F1F1F 또는 #5E5E5E(어두운 배경에선 흰색, 대비 4.5:1) · "Google Maps" 가 두 줄로 나뉘지 않음(nowrap) · translate="no" ·
 * 글꼴 Roboto(없으면 제품 sans-serif) · weight 400 · 표기·대소문자 변경 금지.
 * 코스 상세(variant="place" — 평점이 없어 "장소 정보 제공: Google Maps")·앱 코스 선택·/discover 가 모두 이 컴포넌트를 쓴다.
 */
export function GoogleAttribution({ className = "", variant = "rating" }: { className?: string; variant?: "rating" | "place" }) {
  return (
    <p className={`text-[12px] font-normal text-[#5E5E5E] dark:text-white ${className}`.trim()}>
      {variant === "place" ? "장소 정보 제공:" : "평점·리뷰 정보 제공:"}{" "}
      <span translate="no" className="gmp-attribution whitespace-nowrap font-normal" style={{ fontFamily: "Roboto, var(--font-sans), sans-serif", letterSpacing: "normal" }}>
        Google Maps
      </span>
    </p>
  );
}
