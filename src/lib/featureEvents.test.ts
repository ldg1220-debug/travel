import { describe, expect, it } from "vitest";
import { FEATURE_EVENT_NAMES } from "./featureEvents";
import { SAVE_FUNNEL_EVENTS } from "./server/affiliateClickStats";

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
