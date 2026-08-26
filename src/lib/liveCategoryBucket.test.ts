import { describe, it, expect } from "vitest";
import { liveCategoryBucket } from "./liveCategoryBucket";

// 작업지시서(2026-08-26, "PR #216 검증 + 후속 2건") 4항 — 지시서가 프로덕션
// 실측으로 제시한 5개 타입이 실제로 올바른 버킷으로 분류되는지 고정한다.
describe("liveCategoryBucket", () => {
  it("exact-map에 없는 타입도 접미사 규칙으로 올바르게 분류한다 (지시서 4항 실측 5종)", () => {
    expect(liveCategoryBucket("chicken_restaurant")).toBe("음식점");
    expect(liveCategoryBucket("coffee_stand")).toBe("카페");
    expect(liveCategoryBucket("wine_bar")).toBe("술집");
    expect(liveCategoryBucket("indoor_playground")).toBe("테마파크");
  });

  it("'barbecue' 안의 'bar' 부분 문자열에 걸려 술집으로 오분류되지 않는다 (실측으로 발견된 실제 버그, 지시서 4항)", () => {
    // 작업지시서는 이 타입이 "기타로 떨어진다"고 예측했지만, 재현 결과는
    // "잘못된 버킷(술집)으로 떨어진다"였다 — 단어 경계 없는 부분 문자열
    // 매칭(`includes("bar")`)이 원인. 접미사(`_restaurant`)를 우선
    // 확인하는 단어 경계 매칭으로 고쳐 이 케이스를 고정한다.
    expect(liveCategoryBucket("korean_barbecue_restaurant")).toBe("음식점");
  });

  it("exact-map 항목은 접미사 규칙보다 우선한다", () => {
    expect(liveCategoryBucket("barbecue_restaurant")).toBe("음식점");
  });

  it("*_park는 접미사만으로 갈리지 않으므로 exact-map에만 의존한다 (water_park/amusement_park=테마파크, city_park류=기타로 안전하게 떨어짐)", () => {
    expect(liveCategoryBucket("water_park")).toBe("테마파크");
    expect(liveCategoryBucket("amusement_park")).toBe("테마파크");
  });

  it("한글 카테고리는 부분 문자열 매칭을 그대로 쓴다", () => {
    expect(liveCategoryBucket("이자카야")).toBe("술집");
    expect(liveCategoryBucket("관광명소")).toBe("관광지");
  });

  it("어디에도 안 걸리면 기타를 반환한다", () => {
    expect(liveCategoryBucket("Place")).toBe("기타");
    expect(liveCategoryBucket("무언가_알수없는_타입")).toBe("기타");
  });
});
