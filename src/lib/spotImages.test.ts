import { describe, expect, it } from "vitest";
import { SPOT_IMAGES } from "@/data/spotImages";
import { allSpots } from "@/lib/discoverData";
import { regionImageFor, spotImageCredit } from "./spotImages";

describe("spotImages", () => {
  const ids = new Set([...allSpots("domestic"), ...allSpots("overseas")].map((s) => s.id));
  it("모든 이미지는 실제 스팟 id 이고 출처·라이선스·저작자가 있다", () => {
    for (const [id, img] of Object.entries(SPOT_IMAGES)) {
      expect(ids.has(id), id).toBe(true);
      expect(img.url, id).toMatch(/^https:\/\/(thumb|upload)\.wikimedia\.org\//);
      expect(img.page, id).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(img.license, id).toMatch(/^(CC0|CC BY|Public domain)/i);
      expect(img.author.length, id).toBeGreaterThan(0);
    }
  });
  it("출처 표기 문구", () => {
    expect(spotImageCredit(SPOT_IMAGES["d-f1"])).toBe("사진: Basile Morin · CC BY-SA 4.0");
  });
  it("지역 이름으로 대표 이미지를 찾고, 없으면 undefined", () => {
    expect(regionImageFor("서울")).toBeDefined();
    expect(regionImageFor("")).toBeUndefined();
    expect(regionImageFor("존재하지않는지역")).toBeUndefined();
  });
});
