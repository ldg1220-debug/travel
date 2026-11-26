import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PlannerHeaderText } from "./PlannerHeaderText";

describe("PlannerHeaderText 서버 렌더", () => {
  it("날짜·계획 이름 글자를 서버 HTML 에 내지 않는다(하이드레이션 불일치 방지)", () => {
    const html = renderToString(
      createElement(PlannerHeaderText, { dateLabel: "11월 26일 목요일 · 공유됨", title: "새 여행" }),
    );
    expect(html).not.toContain("11월");
    expect(html).not.toContain("새 여행");
    expect(html).toContain("<span");
  });
});
