import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./HomeClient", () => ({ HomePage: () => null }));

import Page from "./page";

// 작업지시서 2026-10-08 "#300 검증" §2 — Travelpayouts Drive: 홈(/)에 로드, 공유 토큰이 URL에 있는 페이지에는 로드하지 않는다.
describe("Travelpayouts Drive 범위", () => {
  it("홈 HTML에 사용자 제공 스니펫 src가 정확히 한 번 들어간다", () => {
    const html = renderToStaticMarkup(Page());
    expect(html.match(/emrldtp\.com\/NTYzMDg1\.js\?t=563085/g)).toHaveLength(1);
  });

  it("공유 토큰이 URL에 있는 페이지(/planner/[shareToken]·/trip/[id])의 서버 컴포넌트는 정적 Drive 스크립트를 넣지 않는다", () => {
    for (const rel of ["planner/[shareToken]/page.tsx", "trip/[id]/page.tsx", "planner/page.tsx"]) {
      let source = "";
      try {
        source = readFileSync(join(__dirname, rel), "utf-8");
      } catch {
        continue; // 파일 구조가 달라도 이 가드는 "있으면 검사"다
      }
      expect(source, rel).not.toContain("TravelpayoutsDriveScript");
    }
  });
});
