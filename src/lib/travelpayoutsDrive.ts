/**
 * Travelpayouts Drive 스니펫 — 원래 작업지시서 2026-08-17 "Travelpayouts
 * Drive 스크립트 설치"로 전체 사이트(루트 layout.tsx `<head>`)에 깔았으나,
 * 작업지시서 2026-09-11 "계획 탭 동선을 실제 경로로" §4 실측으로 계획
 * 탭(제휴 링크가 없는 방문)에서도 매번 로드돼 `/collect` 503 3회 +
 * `location=` 파라미터에 계획 공유 토큰이 그대로 실려 나가는 문제가
 * 확인됐다. "제휴 링크가 실제로 있는 페이지에만 넣으세요"에 따라 이제
 * 페이지별로 필요할 때만 불러온다:
 *  - /discover, /course: 항상 제휴 링크(숙소·eSIM 등)가 있어 SSR 시점에
 *    바로 넣는다(원래처럼 하이드레이션을 안 기다리는 즉시 로드 — 아래
 *    inlineScript()).
 *  - /planner(및 그 공유뷰 /planner/[shareToken]): 도시별로 숙소 제휴
 *    링크가 있을 때만 있어(PlannerBoard.tsx의 hasAffiliateLink 참고)
 *    서버 렌더 시점엔 알 수 없다 — 클라이언트에서 그 조건이 참으로
 *    바뀌는 순간에만 loadTravelpayoutsDriveScript()로 주입한다.
 *
 * 원본 IIFE 자체는 손대지 않는다 — `next/script`를 거치지 않고 벤더가
 * 준 그대로 직접 DOM에 스크립트 태그를 만드는 이유는 layout.tsx에 있던
 * 원래 주석 그대로다: Next의 `next/script`는 어떤 strategy를 쓰든 원시
 * `<script src>` 태그를 초기 HTML에 내보내지 않고 `<link rel=preload>` +
 * 로더 큐로 바꿔버려서, Travelpayouts 검증기가 원본 벤더 스니펫 형태를
 * 전제로 한다면 실패 원인이 될 수 있다.
 */
export const TRAVELPAYOUTS_DRIVE_SCRIPT_ID = "tp-drive";
const TRAVELPAYOUTS_DRIVE_SCRIPT_SRC = "https://emrldtp.com/NTYzMDg1.js?t=563085";

function iifeSource(): string {
  return `(function(){var s=document.createElement('script');s.async=1;s.setAttribute('data-cmp-ab','2');s.id='${TRAVELPAYOUTS_DRIVE_SCRIPT_ID}';s.src='${TRAVELPAYOUTS_DRIVE_SCRIPT_SRC}';document.head.appendChild(s);})();`;
}

/** 서버 컴포넌트(페이지)에서 그대로 렌더할 인라인 `<script>` 태그의 소스 — SSR된 초기 HTML의 일부로 파싱되므로 하이드레이션을 기다리지 않고 즉시 실행된다. */
export function travelpayoutsDriveInlineScript(): string {
  return iifeSource();
}

/**
 * 클라이언트 컴포넌트에서 조건이 참이 되는 시점(예: hasAffiliateLink)에
 * 호출하는 명령형 로더 — 이미 주입돼 있으면 다시 추가하지 않는다(id로
 * 판별, 원본 스니펫도 `s.id='tp-drive'`를 직접 붙인다).
 */
export function loadTravelpayoutsDriveScript(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(TRAVELPAYOUTS_DRIVE_SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.async = true;
  s.id = TRAVELPAYOUTS_DRIVE_SCRIPT_ID;
  s.src = TRAVELPAYOUTS_DRIVE_SCRIPT_SRC;
  document.head.appendChild(s);
}
