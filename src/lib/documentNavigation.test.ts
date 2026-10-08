import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isTokenSensitiveTarget, navigateByDocumentIfNeeded, pushSafely, shouldNavigateByDocument } from "./documentNavigation";

// 작업지시서 2026-10-08 "#301 검증" §2 — Drive가 로드된 문서에서 /planner/**·/trip/**·course-open으로 가는 이동은 전체 문서 이동.

function stubDocument(driveLoaded: boolean) {
  vi.stubGlobal("document", { getElementById: (id: string) => (driveLoaded && id === "tp-drive" ? {} : null) });
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  return assign;
}

describe("documentNavigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("토큰 민감 목적지: /planner · /planner/{토큰} · /trip/{id} · course-open (쿼리·해시 무시)", () => {
    for (const href of ["/planner", "/planner?openDetail=1", "/planner/abc-token", "/trip/7", "/trip/7#comments", "/api/content/course-open?region=%EA%B2%BD%EC%A3%BC&days=3"]) {
      expect(isTokenSensitiveTarget(href), href).toBe(true);
    }
    for (const href of ["/", "/discover", "/course", "/course/%EC%98%A4%EC%82%AC%EC%B9%B4/2%EB%B0%953%EC%9D%BC", "/community/3", "/scrapbook", "/planners-guide"]) {
      expect(isTokenSensitiveTarget(href), href).toBe(false);
    }
  });

  it("Drive가 로드된 문서에서만 전체 문서 이동 — router.push 대신 location.assign", () => {
    const push = vi.fn();
    const assign = stubDocument(true);
    pushSafely({ push }, "/planner");
    pushSafely({ push }, "/trip/7");
    pushSafely({ push }, "/course");
    expect(assign.mock.calls.map((c) => c[0])).toEqual(["/planner", "/trip/7"]);
    expect(push.mock.calls.map((c) => c[0])).toEqual(["/course"]); // 토큰 민감 목적지가 아니면 SPA 이동
  });

  it("Drive가 없는 문서(/community 등)에서는 평소처럼 SPA 이동", () => {
    const push = vi.fn();
    const assign = stubDocument(false);
    pushSafely({ push }, "/planner/abc");
    expect(push).toHaveBeenCalledWith("/planner/abc");
    expect(assign).not.toHaveBeenCalled();
    expect(shouldNavigateByDocument("/planner")).toBe(false);
  });

  it("Link onClick: 기본 이동을 막고 전체 문서 이동으로 바꾼다 — 새 탭 클릭·이미 막힌 이벤트는 건드리지 않는다", () => {
    const assign = stubDocument(true);
    const ev = () => ({ preventDefault: vi.fn(), button: 0 });
    const plain = ev();
    navigateByDocumentIfNeeded(plain, "/planner");
    expect(plain.preventDefault).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/planner");
    assign.mockClear();
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      const e = { ...ev(), ...modifier };
      navigateByDocumentIfNeeded(e, "/trip/1");
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    const nonSensitive = ev();
    navigateByDocumentIfNeeded(nonSensitive, "/discover");
    expect(nonSensitive.preventDefault).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});

// 정적 가드 — Drive가 로드되는 페이지(/ · /discover · /course/**)와 그 위에 항상 떠 있는 전역 내비게이션에서
// /planner·/trip·course-open으로 가는 router.push·next/link는 반드시 documentNavigation 헬퍼를 거친다.
describe("정적 가드: Drive 로드 페이지의 토큰 민감 이동", () => {
  const root = join(__dirname, "..");
  const files = [
    "app/(app)/HomeClient.tsx",
    "app/(app)/discover/DiscoverClient.tsx",
    "app/(app)/course/CourseClient.tsx",
    "app/(app)/course/[region]/[days]/page.tsx",
    "components/AppBar.tsx",
    "components/BottomTabBar.tsx",
    "components/NotificationBell.tsx",
  ];

  it.each(files)("%s: router.push로 /planner·/trip에 직접 가지 않는다", (rel) => {
    const source = readFileSync(join(root, rel), "utf-8");
    expect(source.match(/router\.push\(\s*[`"']\/(planner|trip)/g) ?? [], rel).toEqual([]);
  });

  it.each(files)("%s: /planner·/trip(·tab.href)으로 가는 <Link>는 navigateByDocumentIfNeeded를 쓴다", (rel) => {
    const source = readFileSync(join(root, rel), "utf-8");
    // <Link ...> 여는 태그 전체(화살표 함수의 "=>"는 태그 끝이 아니다)를 잡아 그중 토큰 민감 목적지로 가는 것만 본다.
    const links = (source.match(/<Link\b[\s\S]*?(?<!=)>/g) ?? []).filter((tag) => /href=\{?[`"']?\/(planner|trip)|href=\{tab\.href\}/.test(tag));
    // 가드가 실제로 대상 링크를 잡고 있는지(0건이면 정규식이 깨진 것)
    const expected: Record<string, number> = { "app/(app)/HomeClient.tsx": 2, "components/AppBar.tsx": 1, "components/BottomTabBar.tsx": 1 };
    expect(links.length, rel).toBe(expected[rel] ?? 0);
    for (const link of links) expect(link, `${rel}: ${link.slice(0, 80)}`).toContain("navigateByDocumentIfNeeded");
  });
});
