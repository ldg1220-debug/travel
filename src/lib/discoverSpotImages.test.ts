import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allSpots } from "./discoverData";
import { DISCOVER_SPOT_IMAGES, getDiscoverSpotImage, spotCardPhotoSrc } from "./discoverSpotImages";

const base = { name: "테스트", region: "일본 · 오사카" };

describe("discoverSpotImages", () => {
  it("큐레이션 스팟은 어떤 경우에도 spot-photo URL 을 만들지 않는다", () => {
    for (const scope of ["domestic", "overseas"] as const) {
      for (const spot of allSpots(scope)) {
        const src = spotCardPhotoSrc(spot);
        expect(src === null || !src.includes("/api/discover/spot-photo")).toBe(true);
      }
    }
  });

  it("이미지가 있는 id 는 고정 파일 경로, 없는 id 는 null(아이콘 타일)", () => {
    const [id] = Object.keys(DISCOVER_SPOT_IMAGES);
    expect(spotCardPhotoSrc({ id, ...base })).toBe(`/discover/spots/${id}.webp`);
    expect(spotCardPhotoSrc({ id: "d-no-image", ...base })).toBeNull();
    expect(getDiscoverSpotImage({ id: "d-no-image" })).toBeUndefined();
  });

  it("라이브 스팟은 기존처럼 spot-photo 조회(범위 밖)", () => {
    expect(spotCardPhotoSrc({ id: "live:abc", ...base })).toContain("/api/discover/spot-photo?q=");
  });

  it("출처 항목마다 파일이 실제로 있고 출처 필드가 모두 채워져 있다", () => {
    const spotIds = new Set([...allSpots("domestic"), ...allSpots("overseas")].map((s) => s.id));
    for (const [id, img] of Object.entries(DISCOVER_SPOT_IMAGES)) {
      expect(spotIds.has(id)).toBe(true);
      expect(img.src).toBe(`/discover/spots/${id}.webp`);
      expect(existsSync(path.join(process.cwd(), "public", img.src))).toBe(true);
      expect(img.credit && img.license && img.sourceUrl.startsWith("https://")).toBeTruthy();
      expect(img.license).toMatch(/^(CC0|CC BY|CC BY-SA)/);
    }
  });
});
