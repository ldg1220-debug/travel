import { describe, expect, it } from "vitest";
import { activePlanCityLabel, classifyPlan, deriveTripStatus, hasCompletedTrip } from "./tripStatus";
import type { ItineraryItem, SavedPlan } from "./types";

const TODAY = "2026-08-14";

function item(date: string, name = "스팟"): ItineraryItem {
  return { id: `${date}-${Math.random()}`, placeId: "p1", name, date, time: "10:00", durationMinutes: 60, coordinates: { lat: 0, lng: 0 } };
}

function plan(id: string, city: string, items: ItineraryItem[]): SavedPlan {
  return { id, name: city, savedAt: 0, items, places: [], activeDate: items[0]?.date ?? TODAY, currentCity: city, region: "domestic" };
}

// today를 명시적으로 고정한다 — deriveTripStatus는 기본값이 실제
// 오늘(todayISODate())이라, 안 넘기면 테스트가 실행되는 실제 날짜에
// 따라 "trip spanning today"/"ongoing" 같은 픽스처가 매일 어긋난다
// (과거 버전이 이 인자가 없어서 겪었던 문제 그대로).
describe("deriveTripStatus", () => {
  it("returns null when there are no candidates", () => {
    expect(deriveTripStatus([], [], "새 여행", TODAY)).toBeNull();
  });

  it("classifies a trip spanning today as ongoing, day = today's index", () => {
    const p = plan("1", "부산", [item("2026-08-13"), item("2026-08-14"), item("2026-08-15")]);
    const status = deriveTripStatus([p], [], "새 여행", TODAY);
    expect(status).toMatchObject({ kind: "ongoing", city: "부산", dayNumber: 2, dayDate: TODAY, daysUntil: 0 });
  });

  it("classifies a future-only trip as upcoming with correct daysUntil", () => {
    const p = plan("1", "제주", [item("2026-08-20"), item("2026-08-21")]);
    const status = deriveTripStatus([p], [], "새 여행", TODAY);
    expect(status).toMatchObject({ kind: "upcoming", city: "제주", daysUntil: 6 });
  });

  it("excludes a trip that has already fully ended", () => {
    const p = plan("1", "경주", [item("2026-08-01"), item("2026-08-02")]);
    expect(deriveTripStatus([p], [], "새 여행", TODAY)).toBeNull();
  });

  it("picks the day with the fewest stops as the day to finish planning", () => {
    // Day1(08-20): 2곳, Day2(08-21): 1곳 → 스팟이 더 적은 Day2를 골라야 함
    const p = plan("1", "부산", [item("2026-08-20"), item("2026-08-20"), item("2026-08-21")]);
    const status = deriveTripStatus([p], [], "새 여행", TODAY);
    expect(status).toMatchObject({ dayNumber: 2, dayDate: "2026-08-21" });
  });

  it("prefers an ongoing plan over a nearer upcoming one", () => {
    const ongoing = plan("1", "부산", [item("2026-08-14")]);
    const upcoming = plan("2", "제주", [item("2026-08-15")]);
    const status = deriveTripStatus([upcoming, ongoing], [], "새 여행", TODAY);
    expect(status).toMatchObject({ kind: "ongoing", city: "부산" });
  });

  it("falls back to the draft (unsaved) itinerary when there are no saved plans", () => {
    const status = deriveTripStatus([], [item("2026-08-16")], "도쿄", TODAY);
    expect(status).toMatchObject({ kind: "upcoming", planId: null, city: "도쿄" });
  });
});

// 작업지시서(2026-08-26, "탐색이 진행 중인 계획을 덮어쓰는 문제") — 도쿄
// 계획이 활성 상태에서 탐색으로 "마산" 검색을 하면 itineraryStore의 라이브
// top-level currentCity가 오염되는 구조적 문제가 있다. activePlanCityLabel은
// 그 라이브 값을 직접 읽지 않고 계획 자신의 스냅샷에서 파생해 이 증상을
// 차단하는 방어선 — 아래 시나리오들이 지시서 5장의 회귀 테스트 표와 대응한다.
describe("activePlanCityLabel", () => {
  it("도쿄 계획이 활성 상태일 때, 탐색이 오염시킨 라이브 currentCity를 무시하고 그 계획 자신의 도시를 쓴다 (시나리오 1~3)", () => {
    const tokyo = plan("1", "도쿄", [item("2026-08-20")]);
    // "마산 카라반"을 검색해 라이브 currentCity가 오염된 상태를 흉내낸다 —
    // activePlanId가 "1"(도쿄 계획)로 열려 있는데 top-level currentCity만
    // "마산"으로 바뀐 시나리오.
    expect(activePlanCityLabel([tokyo], "1", null, "마산")).toBe("도쿄");
  });

  it("activePlanId가 없는 draft 상태에서는 draft 스냅샷의 currentCity를 우선한다", () => {
    const draft = plan("draft", "도쿄", [item("2026-08-20")]);
    // 라이브 currentCity가 탐색으로 "마산"이 됐어도 draft 스냅샷은
    // 아이템이 안 바뀌는 한 갱신되지 않는다(오토싱크가 items에만 물려있음).
    expect(activePlanCityLabel([], null, draft, "마산")).toBe("도쿄");
  });

  it("draft가 아직 한 번도 동기화되지 않은 세션 최초 순간에는 라이브 값을 그대로 쓴다", () => {
    expect(activePlanCityLabel([], null, null, "도쿄")).toBe("도쿄");
  });

  it("activePlanId가 가리키는 계획의 currentCity가 비어 있으면 계획 이름으로 대체한다", () => {
    const untitled: SavedPlan = { id: "1", name: "제주", savedAt: 0, items: [item("2026-08-20")], places: [], activeDate: "2026-08-20", currentCity: "", region: "domestic" };
    expect(activePlanCityLabel([untitled], "1", null, "마산")).toBe("제주");
  });
});

describe("classifyPlan", () => {
  it("returns draft for a plan with no items", () => {
    expect(classifyPlan(plan("1", "새 여행", []), TODAY)).toBe("draft");
  });
  it("returns ongoing when today falls within the plan's date range", () => {
    expect(classifyPlan(plan("1", "부산", [item("2026-08-13"), item("2026-08-15")]), TODAY)).toBe("ongoing");
  });
  it("returns upcoming when the plan starts in the future", () => {
    expect(classifyPlan(plan("1", "제주", [item("2026-08-20")]), TODAY)).toBe("upcoming");
  });
  it("returns completed when the plan is fully in the past", () => {
    expect(classifyPlan(plan("1", "경주", [item("2026-08-01")]), TODAY)).toBe("completed");
  });
});

describe("hasCompletedTrip", () => {
  it("is false with no plans", () => {
    expect(hasCompletedTrip([], TODAY)).toBe(false);
  });
  it("is true when at least one saved plan has fully ended", () => {
    const past = plan("1", "경주", [item("2026-08-01")]);
    const upcoming = plan("2", "제주", [item("2026-08-20")]);
    expect(hasCompletedTrip([past, upcoming], TODAY)).toBe(true);
  });
  it("is false when every plan is still upcoming/ongoing/draft", () => {
    const upcoming = plan("1", "제주", [item("2026-08-20")]);
    const draft = plan("2", "새 여행", []);
    expect(hasCompletedTrip([upcoming, draft], TODAY)).toBe(false);
  });
});
