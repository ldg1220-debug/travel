import { TRAVELPAYOUTS_DRIVE_SCRIPT_ID } from "./travelpayoutsDrive";

/**
 * 작업지시서 2026-10-08 "#301 검증: Drive는 의도대로 들어갔습니다. 플래너로 가는 링크만 '전체 새로고침'으로" §2.
 *
 * Travelpayouts Drive는 홈(/)·/discover·/course/**에 로드한다(#301). Next의 클라이언트 내비게이션은 이미 `<head>`에
 * 붙은 스크립트를 제거하지 않으므로, 그 페이지에서 `/planner/**`·`/trip/**`(공유 토큰이 URL에 실리는 페이지, #246의
 * `location=` 유출·`/collect` 503 사유)로 SPA 이동하면 Drive가 그 페이지까지 따라 들어간다. Drive가 로드된 문서에서
 * 그런 주소로 갈 때는 "전체 문서 이동"으로 JS 컨텍스트를 초기화해 막는다. 반대 방향(플래너 → 홈)은 토큰 없는
 * 페이지에서 Drive가 새로 로드되므로 문제 없다.
 *
 * Drive가 로드되지 않은 문서(예: /community, /scrapbook)에서는 평소처럼 SPA 이동을 쓴다 — 전체 새로고침 비용을
 * 불필요하게 내지 않는다. 판별은 Drive 스니펫이 붙이는 `<script id="tp-drive">` 유무다.
 */

/** 공유 토큰이 URL에 실리거나 실릴 수 있는 목적지 — 이쪽으로 가는 이동만 전체 문서 이동 대상이다. */
export function isTokenSensitiveTarget(href: string): boolean {
  const path = href.split(/[?#]/)[0];
  return path === "/planner" || path.startsWith("/planner/") || path.startsWith("/trip/") || path.startsWith("/api/content/course-open");
}

function isDriveLoaded(): boolean {
  return typeof document !== "undefined" && document.getElementById(TRAVELPAYOUTS_DRIVE_SCRIPT_ID) != null;
}

/** 이 이동을 전체 문서 이동으로 해야 하는가 — Drive가 로드된 문서에서 토큰 민감 목적지로 갈 때. */
export function shouldNavigateByDocument(href: string): boolean {
  return isTokenSensitiveTarget(href) && isDriveLoaded();
}

/** router.push 대신 쓴다 — 필요하면 window.location.assign으로 전체 문서 이동. */
export function pushSafely(router: { push: (href: string) => void }, href: string): void {
  if (shouldNavigateByDocument(href)) window.location.assign(href);
  else router.push(href);
}

type ClickLike = { defaultPrevented?: boolean; button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; preventDefault: () => void };

/**
 * `<Link>`의 onClick에서 부른다 — 필요하면 기본 SPA 이동을 막고 전체 문서 이동으로 바꾼다. 새 탭 클릭(Ctrl/Cmd/Shift/중클릭)은
 * 어차피 새 문서라 건드리지 않는다. 호출부 자신의 onClick 로직 뒤에 이 함수를 부른다.
 */
export function navigateByDocumentIfNeeded(event: ClickLike, href: string): void {
  if (event.defaultPrevented || (event.button != null && event.button !== 0) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!shouldNavigateByDocument(href)) return;
  event.preventDefault();
  window.location.assign(href);
}
