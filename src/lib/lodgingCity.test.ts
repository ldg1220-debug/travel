import { describe, expect, it } from "vitest";
import { resolveLodgingCity } from "./lodgingAffiliate";

describe("resolveLodgingCity", () => {
  it("공유 계획을 보면 그 계획 제목의 도시를 쓴다 (스토어 기본값 무시)", () => {
    expect(resolveLodgingCity({ viewerMode: true, viewerTitle: "다낭 여행 코스", currentCity: "새 여행" })).toBe("다낭");
  });
  it("공유 계획에서 도시를 못 찾으면 null", () => {
    expect(resolveLodgingCity({ viewerMode: true, viewerTitle: "나의 여행", currentCity: "오사카" })).toBeNull();
    expect(resolveLodgingCity({ viewerMode: true, viewerTitle: null, currentCity: "오사카" })).toBeNull();
  });
  it("내 계획이면 currentCity", () => {
    expect(resolveLodgingCity({ viewerMode: false, viewerTitle: "다낭 여행 코스", currentCity: "오사카" })).toBe("오사카");
  });
  it("기본값 '새 여행'이나 빈 값이면 null(링크 숨김)", () => {
    expect(resolveLodgingCity({ viewerMode: false, currentCity: "새 여행" })).toBeNull();
    expect(resolveLodgingCity({ viewerMode: false, currentCity: " " })).toBeNull();
    expect(resolveLodgingCity({ viewerMode: false, currentCity: "" })).toBeNull();
  });
});
