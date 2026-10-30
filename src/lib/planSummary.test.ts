import { describe, expect, it } from "vitest";
import { planRegionText, summarizePlanForList } from "./planSummary";
import type { ItineraryItem } from "./types";

const it_ = (date: string, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({ id: `${date}-${Math.random()}`, placeId: "p", name: "n", date, time: "09:00", durationMinutes: 60, coordinates: { lat: 1, lng: 1 }, ...extra });
const ms = (iso: string) => Date.parse(iso);

// 작업지시서 2026-10-30 — 저장된 계획 목록 2줄째
describe("summarizePlanForList", () => {
  const base = { name: "하노이 여행 코스 (복사)", currentCity: "", region: "international" as const, savedAt: ms("2026-10-19T05:00:00"), createdAt: ms("2026-10-18T05:00:00") };

  it("여행 날짜 범위 · 일수 · 지역(제목에서) · 장소 수 · 수정일 · 만든 날", () => {
    const s = summarizePlanForList({ ...base, items: [it_("2026-10-24"), it_("2026-10-25"), it_("2026-10-25"), it_("2026-10-26")] }, "2026-10-20");
    expect(s).toMatchObject({ dateText: "10/24~10/26 · 3일", regionText: "하노이", placeCountText: "장소 4곳", updatedText: "수정 10/19", createdText: "만든 날 10/18", past: false });
  });

  it("날짜 미정(dayNumber)이면 '날짜 미정 · N일차까지', 지난 여행으로 보지 않는다", () => {
    const s = summarizePlanForList({ ...base, items: [it_("2026-01-01", { dayNumber: 1 }), it_("2026-01-02", { dayNumber: 2 }), it_("2026-01-03", { dayNumber: 3 })] }, "2026-10-20");
    expect(s.dateText).toBe("날짜 미정 · 3일차까지");
    expect(s.past).toBe(false);
  });

  it("마지막 날이 오늘보다 앞이면 지난 여행 · 하루짜리는 '10/24 · 1일' · 비어 있으면 '일정 없음'", () => {
    expect(summarizePlanForList({ ...base, items: [it_("2026-10-24")] }, "2026-10-25")).toMatchObject({ dateText: "10/24 · 1일", past: true });
    expect(summarizePlanForList({ ...base, items: [it_("2026-10-24")] }, "2026-10-24").past).toBe(false);
    expect(summarizePlanForList({ ...base, items: [] }, "2026-10-25")).toMatchObject({ dateText: "일정 없음", placeCountText: "장소 0곳", past: false });
  });

  it("만든 날을 모르면 createdText 는 null", () => {
    expect(summarizePlanForList({ ...base, createdAt: undefined, items: [] }, "2026-10-25").createdText).toBeNull();
  });
});

describe("planRegionText", () => {
  it("currentCity > 제목 속 알려진 지역 > 국내/해외", () => {
    expect(planRegionText({ name: "0711 오사카", currentCity: "도쿄", region: "international" })).toBe("도쿄");
    expect(planRegionText({ name: "0711 오사카", currentCity: "", region: "international" })).toBe("오사카");
    expect(planRegionText({ name: "엄마랑 여행", currentCity: "새 여행", region: "domestic" })).toBe("국내");
    expect(planRegionText({ name: "엄마랑 여행", currentCity: "", region: "international" })).toBe("해외");
  });
});
