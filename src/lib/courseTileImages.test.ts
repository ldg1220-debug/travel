import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { courseScopeTileImage, courseTileImage } from "./courseTileImages";
import { courseRegionTree } from "./courseRegions";

describe("course tile images (#441)", () => {
  it("1단계 2장은 저장소 이미지 경로", () => {
    expect(courseScopeTileImage("domestic")?.src).toBe("/discover/spots/d-f1.webp");
    expect(courseScopeTileImage("overseas")?.src).toBe("/discover/spots/o-fr1.webp");
  });

  it("1~3단계 타일의 모든 이미지 경로가 spot-photo 가 아니고 파일이 존재", () => {
    const labels = new Set<string>();
    for (const scope of ["domestic", "overseas"] as const) {
      const walk = (nodes: { label: string; children: unknown[] }[]) =>
        nodes.forEach((n) => { labels.add(n.label); walk(n.children as never); });
      walk(courseRegionTree(scope));
    }
    let hits = 0;
    for (const l of labels) {
      const img = courseTileImage(l);
      if (!img) continue;
      hits++;
      expect(img.src).not.toContain("/api/discover/spot-photo");
      expect(img.src.startsWith("/discover/spots/")).toBe(true);
      expect(() => readFileSync(join(process.cwd(), "public", img.src))).not.toThrow();
    }
    expect(hits).toBeGreaterThan(0);
    expect(courseTileImage("없는지역")).toBeUndefined();
  });

  it("2단계 타일 매핑 수 — 해외 대륙 ≥3, 국내 광역 ≥6 (#443)", () => {
    const count = (scope: "domestic" | "overseas") => {
      const tiles = courseRegionTree(scope);
      return tiles.filter((n) => courseTileImage(n.label)).length;
    };
    expect(count("overseas")).toBeGreaterThanOrEqual(3);
    expect(count("domestic")).toBeGreaterThanOrEqual(6);
    for (const l of ["아시아", "유럽", "북미", "전라", "경상"]) {
      expect(courseTileImage(l)?.src.startsWith("/discover/spots/")).toBe(true);
    }
    // 1단계 해외 사진과 대륙 타일 사진이 겹치지 않는다
    expect(courseTileImage("유럽")?.src).not.toBe(courseScopeTileImage("overseas")?.src);
  });

  it("CourseClient 는 spot-photo 를 부르지 않는다", () => {
    const src = readFileSync(join(process.cwd(), "src/app/(app)/course/CourseClient.tsx"), "utf8");
    // 주석 언급은 허용 — 실제 요청 URL 조립(`/api/discover/spot-photo?q=`)만 금지
    expect(src).not.toMatch(/["'`]\/api\/discover\/spot-photo\?/);
    expect(src).not.toMatch(/TilePhoto query=/);
  });
});
