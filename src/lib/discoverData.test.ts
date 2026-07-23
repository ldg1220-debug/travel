import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "./discoverData";

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
