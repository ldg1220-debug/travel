import { describe, expect, it } from "vitest";
import { buildOgDescription } from "./page";
import type { ItineraryItem } from "@/lib/types";

// 작업지시서 2026-09-15 "공유 품질 4건" §1: 카카오톡 공유 카드의
// og:description이 일반 문구("해외 여행 일정 · 트레쥴에서...")가 아니라
// 이 계획만의 구체적인 내용("4박 5일 · 19곳 · 캐널시티 하카타, 다자이후
// 텐만구 외")을 담는지 확인한다.

function item(date: string, time: string, name: string): ItineraryItem {
  return { id: `${date}-${time}`, placeId: `${date}-${time}`, name, date, time, durationMinutes: 60, coordinates: { lat: 0, lng: 0 } };
}

describe("buildOgDescription", () => {
  it("falls back to a generic sentence for an empty itinerary", () => {
    expect(buildOgDescription([])).toBe("트레쥴에서 함께 계획한 여행을 확인하세요.");
  });

  it("labels a single-day plan as 당일치기", () => {
    const desc = buildOgDescription([item("2026-09-20", "09:00", "황리단길"), item("2026-09-20", "12:00", "정록쌈밥")]);
    expect(desc).toBe("당일치기 · 2곳 · 황리단길, 정록쌈밥");
  });

  it("computes N박 M일 from the distinct dates and lists the first two stops in schedule order", () => {
    const items = [
      item("2026-09-22", "14:00", "캐널시티 하카타"),
      item("2026-09-22", "09:00", "다자이후 텐만구"),
      item("2026-09-23", "10:00", "하카타역"),
      item("2026-09-25", "10:00", "구마모토성"),
      item("2026-09-26", "10:00", "공항"),
    ];
    const desc = buildOgDescription(items);
    expect(desc).toBe("3박 4일 · 5곳 · 다자이후 텐만구, 캐널시티 하카타 외");
  });

  it("omits the trailing 외 when every place is already listed", () => {
    const desc = buildOgDescription([item("2026-09-20", "09:00", "A"), item("2026-09-20", "10:00", "B")]);
    expect(desc).not.toContain("외");
  });
});
