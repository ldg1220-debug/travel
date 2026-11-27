import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/trackFeatureEvent", () => ({ trackFeatureEvent: vi.fn() }));

import { PlannerEsimSection, isOverseasPlanCity } from "./PlannerEsimSection";

describe("PlannerEsimSection", () => {
  it("해외 도시 → eSIM 제목·Airalo·Yesim 링크(sub_id=planner_esim)", () => {
    const html = renderToStaticMarkup(createElement(PlannerEsimSection, { city: "타이베이" }));
    expect(html).toContain("타이베이 여행 데이터 eSIM");
    expect(html).toContain("sub_id=planner_esim");
    expect(html).toContain("Airalo");
    expect(html).toContain("Yesim");
  });
  it("국내 도시·도시 없음 → 렌더 안 함", () => {
    expect(renderToStaticMarkup(createElement(PlannerEsimSection, { city: "부산" }))).toBe("");
    expect(renderToStaticMarkup(createElement(PlannerEsimSection, { city: "" }))).toBe("");
    expect(renderToStaticMarkup(createElement(PlannerEsimSection, { city: null }))).toBe("");
    expect(isOverseasPlanCity("부산")).toBe(false);
  });
});
