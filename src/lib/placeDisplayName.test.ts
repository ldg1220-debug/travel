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
    expect(stripNameTail("다낭 맛집 한식당ㅣ독도(dokdo)")).toBe("독도(dokdo)");
    expect(stripNameTail("국제시장 다낭 맛집ㅣKOREAN BBQㅣNhà hàng Chợ Hàn Quốc")).toBe("국제시장");
    expect(stripNameTail("Blue Wave | Best Restaurant")).toBe("Blue Wave");
    expect(stripNameTail("OO 치킨")).toBe("OO 치킨");
    expect(stripNameTail("다낭 맛집ㅣ추천")).toBe("다낭");
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

describe("한글 이름 뒤 한자·가나 꼬리 (작업지시서 2026-11-28)", () => {
  it("실제 이름 4건", () => {
    expect(stripNameTail("탕롱황성(昇龍皇城)")).toBe("탕롱황성");
    expect(stripNameTail("인성원 (鄰聖苑)")).toBe("인성원");
    expect(stripNameTail("성수동석갈비 聖水洞韓式豬排 seongsudong stone grilled pork")).toBe("성수동석갈비");
    expect(stripNameTail("한국요리 돈키호테 (韓国料理 豚キホーテ)")).toBe("한국요리 돈키호테");
  });
  it("건드리지 않는 이름", () => {
    expect(stripNameTail("문묘(반미에우)")).toBe("문묘(반미에우)");
    expect(stripNameTail("36거리(구시가지)")).toBe("36거리(구시가지)");
    expect(stripNameTail("5·4광장 (五四广场)")).toBe("5·4광장");
    expect(stripNameTail("Coca-Cola")).toBe("Coca-Cola");
    expect(stripNameTail("Hoan Kiem Lake")).toBe("Hoan Kiem Lake");
    expect(stripNameTail("鄰聖苑")).toBe("鄰聖苑");
    expect(stripNameTail("豚キホーテ (Donki)")).toBe("豚キホーテ (Donki)");
  });
  it("정리 결과가 2글자 이상", () => {
    expect(stripNameTail("오사카 (大阪)")).toBe("오사카");
    expect(stripNameTail("가 (大阪)")).toBe("가 (大阪)");
  });
});

