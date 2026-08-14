import { describe, expect, it } from "vitest";
import { allSpots, isPlaceholderSpot, parseSearchQuery, regionHierarchy, resolveLeafCityCoords } from "./discoverData";

describe("parseSearchQuery", () => {
  it("strips a trailing intent keyword and tags the category", () => {
    expect(parseSearchQuery("경주 맛집")).toEqual({ coreQuery: "경주", intentTag: "음식점" });
  });

  it("returns no intent tag for a plain place search", () => {
    expect(parseSearchQuery("경주")).toEqual({ coreQuery: "경주", intentTag: null });
  });

  // Regression coverage for #87 — locality filler words carry no category
  // meaning and must be dropped before intent-keyword matching, otherwise
  // they'd break the AND-of-tokens match against place names/regions.
  it("drops locality filler words like 근처/인근/주변", () => {
    expect(parseSearchQuery("우메다 근처 맛집")).toEqual({ coreQuery: "우메다", intentTag: "음식점" });
  });

  // Regression coverage for the dish-keyword fallback (#79) — a query with
  // no explicit "맛집"/"음식점" suffix should still infer food intent from
  // a recognizable dish name, and keep the dish word in coreQuery since
  // it's also a real subTags match term.
  it("infers 음식점 intent from a bare dish keyword with no explicit suffix", () => {
    expect(parseSearchQuery("오사카 라멘")).toEqual({ coreQuery: "오사카 라멘", intentTag: "음식점" });
  });

  it("returns an empty coreQuery when the query is only the intent keyword", () => {
    expect(parseSearchQuery("맛집")).toEqual({ coreQuery: "", intentTag: "음식점" });
  });

  it("prefers the longest matching intent keyword (게스트하우스 over 숙소)", () => {
    expect(parseSearchQuery("교토 게스트하우스")).toEqual({ coreQuery: "교토", intentTag: "숙소" });
  });
});

// GitHub #164 — 템플릿 생성 스팟("종로 레트로 골목" 류 실존 확인 안 된
// 채움용 카드, discoverData.ts 전체의 84%였음) 제거 이후의 회귀 테스트.
describe("템플릿 생성 스팟 제거 (#164)", () => {
  it("isPlaceholderSpot을 만족하는 스팟이 더 이상 없다", () => {
    for (const scope of ["domestic", "overseas"] as const) {
      expect(allSpots(scope).filter(isPlaceholderSpot)).toEqual([]);
    }
  });

  it("템플릿으로만 채워졌던 도시도 지역별 드릴다운에서 여전히 선택 가능하다 (라이브 검색 진입점)", () => {
    const overseasTree = regionHierarchy("overseas");
    const japan = overseasTree.find((c) => c.label === "아시아")?.children.find((c) => c.label === "일본");
    expect(japan?.children.map((c) => c.label)).toContain("나고야");

    const domesticTree = regionHierarchy("domestic");
    const gangwon = domesticTree.find((p) => p.label === "강원");
    expect(gangwon?.children.map((c) => c.label)).toContain("강릉");
  });
});

describe("resolveLeafCityCoords", () => {
  it("해외: [대륙,국가,도시]가 다 있어야 좌표를 찾는다", () => {
    expect(resolveLeafCityCoords("overseas", ["아시아", "일본", "나고야"])).toEqual({
      city: "나고야",
      region: "일본 · 나고야",
      lat: 35.1815,
      lng: 136.9066,
    });
  });

  it("해외: 대륙/국가만으로는 도시가 특정되지 않아 null", () => {
    expect(resolveLeafCityCoords("overseas", ["아시아", "일본"])).toBeNull();
    expect(resolveLeafCityCoords("overseas", ["아시아"])).toBeNull();
  });

  it("국내: 도-소속 도시(bare label)를 찾는다", () => {
    expect(resolveLeafCityCoords("domestic", ["강원", "강릉"])).toEqual({
      city: "강릉",
      region: "강릉",
      lat: 37.7519,
      lng: 128.8761,
    });
  });

  it("국내: metro 동네(\"광역 · 동네\" 포맷)를 찾는다", () => {
    expect(resolveLeafCityCoords("domestic", ["서울", "성수"])).toEqual({
      city: "성수",
      region: "서울 · 성수",
      lat: 37.5445,
      lng: 127.0557,
    });
  });

  it("카탈로그에 없는 도시는 null (실존 큐레이션 도시는 애초에 이 경로를 안 탐)", () => {
    expect(resolveLeafCityCoords("domestic", ["강원", "존재안함"])).toBeNull();
  });
});
