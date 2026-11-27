import { describe, expect, it } from "vitest";
import { FEATURE_EVENT_NAMES } from "./featureEvents";
import { SAVE_FUNNEL_EVENTS, buildAffiliateClickRows } from "./server/affiliateClickStats";

describe("담아가기 중간 단계 이벤트 (2026-11-27)", () => {
  it("새 이벤트 이름이 서버 허용 목록(FEATURE_EVENT_NAMES)에 있다", () => {
    for (const name of ["plan_copy_choice", "plan_copy_login_shown", "login_provider_click"]) {
      expect(FEATURE_EVENT_NAMES).toContain(name);
    }
  });
  it("SAVE_FUNNEL_EVENTS 는 퍼널 순서대로이고 전부 허용된 이벤트다", () => {
    expect([...SAVE_FUNNEL_EVENTS]).toEqual([
      "course_page_cta_click",
      "plan_copy_click",
      "plan_copy_choice",
      "plan_copy_login_shown",
      "login_provider_click",
      "plan_copy_completed",
      "plan_save",
    ]);
    for (const e of SAVE_FUNNEL_EVENTS) expect(FEATURE_EVENT_NAMES).toContain(e);
  });
});

describe("제휴 클릭 surface 집계 (2026-11-28)", () => {
  const raw = [
    { event: "esim_click", provider: "airalo", surface: "planner", today: "1", last7d: "1" },
    { event: "esim_click", provider: "yesim", surface: null, today: "0", last7d: "1" },
    { event: "lodging_click", provider: "trip", surface: "course", today: "0", last7d: "2" },
    { event: "lodging_click", provider: "klook-hotel", surface: "planner", today: "0", last7d: "1" },
  ];
  it("surface null 은 unknown 으로 매핑하고 기존 필드를 유지한다", () => {
    const { rows } = buildAffiliateClickRows(raw);
    expect(rows[1]).toEqual({ event: "esim_click", provider: "yesim", surface: "unknown", today: 0, last7d: 1 });
    expect(rows[0].provider).toBe("airalo");
  });
  it("bySurface 합계는 rows 전체 합계와 같다", () => {
    const { rows, bySurface } = buildAffiliateClickRows(raw);
    const sum = (k: "today" | "last7d", a: { today: number; last7d: number }[]) => a.reduce((s, x) => s + x[k], 0);
    expect(sum("last7d", bySurface)).toBe(sum("last7d", rows));
    expect(sum("today", bySurface)).toBe(sum("today", rows));
    expect(bySurface.find((x) => x.surface === "planner")).toEqual({ surface: "planner", today: 1, last7d: 2 });
  });
});
