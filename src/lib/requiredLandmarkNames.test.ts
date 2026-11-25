import { describe, expect, it } from "vitest";
import { matchesLandmarkName } from "./requiredLandmarkNames";

describe("matchesLandmarkName", () => {
  it("전망대·view 가 붙은 본 장소 이름은 일치한다 (타이베이·도쿄 회귀)", () => {
    expect(matchesLandmarkName("타이베이101 전망대", "타이베이 101")).toBe(true);
    expect(matchesLandmarkName("도쿄 스카이트리 전망대", "도쿄 스카이트리")).toBe(true);
    expect(matchesLandmarkName("Tokyo Skytree View", "tokyo skytree")).toBe(true);
  });

  it("입구·조망 골목 같은 부분 지점 이름은 불일치한다 (방콕)", () => {
    expect(matchesLandmarkName("왓 포 동쪽 입구", "왓 포")).toBe(false);
    expect(
      matchesLandmarkName("왓아룬 조망 골목(골목뷰) Night view point watarun", "왓 아룬"),
    ).toBe(false);
  });

  it("공백 차이는 무시하고 본 사원은 일치한다", () => {
    expect(matchesLandmarkName("왓포", "왓 포")).toBe(true);
    expect(matchesLandmarkName("왓 아룬", "왓 아룬")).toBe(true);
  });
});
