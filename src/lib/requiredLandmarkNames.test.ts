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

  it("하노이: 괄호 병기 표기는 일치, 호수 입구·주차 부분 지점은 불일치", () => {
    expect(matchesLandmarkName("문묘(반미에우)", "문묘")).toBe(true);
    expect(matchesLandmarkName("36거리(구시가지)", "36거리")).toBe(true);
    expect(matchesLandmarkName("탕롱황성(昇龍皇城)", "탕롱황성")).toBe(true);
    expect(matchesLandmarkName("호안끼엠 호수", "호안끼엠 호수")).toBe(true);
    expect(matchesLandmarkName("호안끼엠 호수 입구", "호안끼엠 호수")).toBe(false);
    expect(matchesLandmarkName("호안끼엠 호수 주차장", "호안끼엠 호수")).toBe(false);
  });

  it("후쿠오카: 거리 병기는 일치, 입구·주차·부분 지점은 불일치", () => {
    expect(matchesLandmarkName("나카스 포장마차 거리", "나카스 포장마차")).toBe(true);
    expect(matchesLandmarkName("캐널시티 하카타", "캐널시티 하카타")).toBe(true);
    expect(matchesLandmarkName("오호리 공원 주차장", "오호리 공원")).toBe(false);
    expect(matchesLandmarkName("구시다 신사 입구", "구시다 신사")).toBe(false);
    expect(matchesLandmarkName("후쿠오카 성 조견로", "후쿠오카 타워")).toBe(false);
    expect(matchesLandmarkName("나가하마 공원", "오호리 공원")).toBe(false);
  });

  it("홍콩: 피크 트램 정류장·입구·주차장·매표소는 불일치, 본 장소는 일치", () => {
    expect(matchesLandmarkName("빅토리아 피크", "빅토리아 피크")).toBe(true);
    expect(matchesLandmarkName("스타페리", "스타페리")).toBe(true);
    expect(matchesLandmarkName("피크 트램 정류장", "빅토리아 피크")).toBe(false);
    expect(matchesLandmarkName("빅토리아 피크 입구", "빅토리아 피크")).toBe(false);
    expect(matchesLandmarkName("빅토리아 피크 주차장", "빅토리아 피크")).toBe(false);
    expect(matchesLandmarkName("만모 사원 매표소", "만모 사원")).toBe(false);
    expect(matchesLandmarkName("SKY100 홍콩 전망대", "빅토리아 피크")).toBe(false);
  });
});
