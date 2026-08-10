import { describe, expect, it } from "vitest";
import { parseUserLocation } from "./parseUserLocation";

describe("parseUserLocation", () => {
  it("lat/lng가 아예 없으면 null을 반환한다 (회귀: Number(null)이 0으로 강제변환되던 버그)", () => {
    expect(parseUserLocation(new URLSearchParams("region=domestic&q=경복궁"))).toBeNull();
  });

  it("lat만 있고 lng가 없으면 null을 반환한다", () => {
    expect(parseUserLocation(new URLSearchParams("lat=37.5"))).toBeNull();
  });

  it("lng만 있고 lat가 없으면 null을 반환한다", () => {
    expect(parseUserLocation(new URLSearchParams("lng=127"))).toBeNull();
  });

  it("정상 좌표는 그대로 파싱한다", () => {
    expect(parseUserLocation(new URLSearchParams("lat=37.5665&lng=126.978"))).toEqual({ lat: 37.5665, lng: 126.978 });
  });

  it("명시적으로 (0,0)이 와도 null로 취급한다 (실사용 GPS로는 나올 수 없는 값)", () => {
    expect(parseUserLocation(new URLSearchParams("lat=0&lng=0"))).toBeNull();
  });

  it("숫자로 파싱 안 되는 값은 null을 반환한다", () => {
    expect(parseUserLocation(new URLSearchParams("lat=abc&lng=127"))).toBeNull();
  });

  it("빈 문자열 파라미터도 null을 반환한다", () => {
    expect(parseUserLocation(new URLSearchParams("lat=&lng="))).toBeNull();
  });
});
