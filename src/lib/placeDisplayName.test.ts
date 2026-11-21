import { describe, expect, it } from "vitest";
import { formatKoreanDisplay, hasHangul, needsKoreanName, stripNameTail } from "./placeDisplayName";
import { pickRepresentativeSpots } from "./coursePages";
import type { CourseBriefSpot } from "./server/courseBrief";

const spot = (o: Partial<CourseBriefSpot>): CourseBriefSpot => ({ name: "x", category: "관광지", lat: 0, lng: 0, order: 1, day: 1, toNextMinutes: null, toNextMode: null, ...o }) as CourseBriefSpot;

describe("표시 이름 (작업지시서 2026-11-22)", () => {
  it("한글 유무 판정", () => {
    expect(hasHangul("鄰聖苑")).toBe(false);
    expect(hasHangul("5·4광장 (五四广场)")).toBe(true);
    expect(needsKoreanName("鄰聖苑")).toBe(true);
    expect(needsKoreanName("1234")).toBe(false);
  });
  it("' - ' 뒤 설명을 자른다", () => {
    expect(stripNameTail("Blue Wave Island Adventures - Island Hopping in Mactan Cebu")).toBe("Blue Wave Island Adventures");
    expect(stripNameTail("Awakening Cafe Tokyo - Shibuya")).toBe("Awakening Cafe Tokyo");
    expect(stripNameTail("Coca-Cola Store")).toBe("Coca-Cola Store");
    expect(stripNameTail("A - Long Tail")).toBe("A - Long Tail");
  });
  it("한글 표기 병기", () => {
    expect(formatKoreanDisplay("5·4광장", "五四广场")).toBe("5·4광장 (五四广场)");
    expect(formatKoreanDisplay(undefined, "五四广场")).toBe("五四广场");
  });
  it("대표 장소 — 명소 카테고리만, 투어업체·조합·식당·한글 없는 이름 제외", () => {
    const spots = [
      spot({ name: "Blue Wave Island Adventures", order: 1 }),
      spot({ name: "쓰루하시 상점가 진흥조합 쓰루신", order: 2 }),
      spot({ name: "분보남보 박프엉", category: "음식점", order: 3 }),
      spot({ name: "鄰聖苑", order: 4 }),
      spot({ name: "산토니뇨 성당", category: "사원·성당", order: 5 }),
      spot({ name: "세부 투어 센터", order: 6 }),
      spot({ name: "마젤란 크로스", category: "명소/유적", order: 7 }),
    ];
    expect(pickRepresentativeSpots(spots, 3)).toEqual(["산토니뇨 성당", "마젤란 크로스"]);
  });
});
