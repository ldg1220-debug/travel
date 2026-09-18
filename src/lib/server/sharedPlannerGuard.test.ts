import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { refererIsSharedPlannerView } from "./sharedPlannerGuard";

// 작업지시서 2026-09-18 "뷰어 모드를 우회하는 저장 경로" §5-①: 클라이언트의
// viewerModeActive 플래그가 신뢰할 수 없는 것으로 확인돼(공유/콘텐츠 링크
// 탭을 몇 분 열어두면 초기값으로 되돌아감), 서버가 브라우저의 Referer
// 헤더로 독립적으로 한 번 더 확인한다.

function requestWithReferer(referer: string | null): NextRequest {
  const headers = new Headers();
  if (referer != null) headers.set("referer", referer);
  return new NextRequest("http://localhost/api/itineraries", { headers });
}

describe("refererIsSharedPlannerView", () => {
  it("flags a request whose Referer is a shared plan view", () => {
    expect(refererIsSharedPlannerView(requestWithReferer("https://www.tradule.co.kr/planner/76b80f1a-abcd"))).toBe(true);
  });

  it("does not flag a request whose Referer is the user's own planner workspace", () => {
    expect(refererIsSharedPlannerView(requestWithReferer("https://www.tradule.co.kr/planner"))).toBe(false);
  });

  it("does not flag a request from an unrelated page", () => {
    expect(refererIsSharedPlannerView(requestWithReferer("https://www.tradule.co.kr/discover"))).toBe(false);
  });

  it("does not flag a request with no Referer at all (privacy settings etc.)", () => {
    expect(refererIsSharedPlannerView(requestWithReferer(null))).toBe(false);
  });

  it("does not throw on a malformed Referer", () => {
    expect(refererIsSharedPlannerView(requestWithReferer("not-a-url"))).toBe(false);
  });
});
