import { describe, expect, it } from "vitest";
import { formatPlanDay, planDayNumber, planHeaderDateLabel } from "./planDay";

const content = [{ date: "2026-10-18" }, { date: "2026-10-18" }, { date: "2026-10-19" }, { date: "2026-10-20" }];
const undated = [{ date: "2026-10-24", dayNumber: 1 }, { date: "2026-10-25", dayNumber: 2 }];

describe("planDayNumber / formatPlanDay", () => {
  it("shows the real date for an ordinary plan", () => {
    expect(planDayNumber("2026-10-18", content, false)).toBeNull();
    expect(formatPlanDay("2026-10-18", content, false)).toBe("10/18 (일)");
    expect(formatPlanDay("2026-10-18", content, false, true)).toBe("10월 18일 일요일");
  });
  it("shows N일차 for a content plan being viewed (by date order)", () => {
    expect(formatPlanDay("2026-10-18", content, true)).toBe("1일차");
    expect(formatPlanDay("2026-10-20", content, true)).toBe("3일차");
  });
  it("shows N일차 for an undated plan from dayNumber, even outside viewer mode", () => {
    expect(formatPlanDay("2026-10-25", undated, false)).toBe("2일차");
  });
});

describe("planHeaderDateLabel", () => {
  it("is the course span for a viewed content plan", () => {
    expect(planHeaderDateLabel("2026-10-18", content, true)).toBe("2박3일 코스");
  });
  it("is N일차 for an undated plan and a long date otherwise", () => {
    expect(planHeaderDateLabel("2026-10-24", undated, false)).toBe("1일차");
    expect(planHeaderDateLabel("2026-10-18", content, false)).toBe("10월 18일 일요일");
  });
});
