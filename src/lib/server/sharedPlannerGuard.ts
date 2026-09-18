import type { NextRequest } from "next/server";

/**
 * Referer의 경로가 /planner/{shareToken} 형태(뷰어 화면)인지 확인한다 —
 * 작업지시서 2026-09-18 "뷰어 모드를 우회하는 저장 경로" §5-① 실측:
 * course-open/공유 링크 탭을 몇 분 이상 열어두면 클라이언트의
 * viewerModeActive 플래그가 어떤 경로로 초기값(false)으로 돌아가
 * 자동 저장이 다시 새어 나갔다("공유/콘텐츠 링크를 열고 10분 뒤 저장
 * 발생, 사용자는 아무 조작도 안 함"). "클라이언트가 괜찮다고 하면
 * 서버가 믿는" 구조 자체가 문제라, 클라이언트가 보낸 값이 아니라
 * 브라우저가 실제 fetch 시점에 채우는 Referer 헤더(같은 출처 요청이면
 * 페이지 JS가 마음대로 바꿀 수 없다)로 "이 요청이 정말 뷰어 화면에서
 * 나왔는지"를 서버가 독립적으로 확인한다. 이 화면(/planner/{shareToken})은
 * 설계상 읽기 전용 스냅샷이므로 이 경로에서 나온 저장 요청은 그
 * 자체로 항상 의심스럽다 — Referer가 없으면(프라이버시 설정 등) 판단을
 * 보류한다(다른 방어층인 지역 불일치 확인이 여전히 남아 있다).
 *
 * `route.ts`(POST /api/itineraries)가 아니라 이 별도 파일에 두는 이유는
 * 순수하게 테스트 편의다 — route.ts는 `@/auth`(next-auth)를 import하는데,
 * 그게 vitest(node 환경)에서 next-auth 내부의 서브패스 export 해석
 * 문제로 아예 로드가 안 된다("Cannot find module 'next/server'..."). 이
 * 함수 자체는 auth와 무관한 순수 로직이라, 별도 모듈로 빼면 그 문제를
 * 안 건드리고 단위 테스트할 수 있다.
 */
export function refererIsSharedPlannerView(request: NextRequest): boolean {
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const path = new URL(referer).pathname;
    return path.startsWith("/planner/") && path !== "/planner/";
  } catch {
    return false;
  }
}
