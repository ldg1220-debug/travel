import { describe, expect, it } from "vitest";
import { categorySlugsFor, communityCategoryLabel, isCommunityCategory, normalizeCommunityCategory } from "./community";

describe("isCommunityCategory", () => {
  it("accepts only the current (post-consolidation) slugs", () => {
    expect(isCommunityCategory("free")).toBe(true);
    expect(isCommunityCategory("companion")).toBe(true);
    expect(isCommunityCategory("tips")).toBe(true);
  });

  it("rejects pre-consolidation legacy slugs — new posts must use the merged categories", () => {
    expect(isCommunityCategory("qna")).toBe(false);
    expect(isCommunityCategory("info-domestic")).toBe(false);
    expect(isCommunityCategory("info-international")).toBe(false);
  });
});

describe("communityCategoryLabel", () => {
  it("labels a current slug directly", () => {
    expect(communityCategoryLabel("companion")).toBe("동행 구해요");
  });

  it("resolves a legacy slug to its merged category's label — old posts still render a real label instead of the raw slug", () => {
    expect(communityCategoryLabel("qna")).toBe("자유수다·질문");
    expect(communityCategoryLabel("info-domestic")).toBe("정보·꿀팁");
    expect(communityCategoryLabel("info-international")).toBe("정보·꿀팁");
  });

  it("falls back to the raw string for a totally unknown slug", () => {
    expect(communityCategoryLabel("made-up")).toBe("made-up");
  });
});

describe("categorySlugsFor", () => {
  it("includes the canonical slug plus every legacy slug that merged into it", () => {
    expect(categorySlugsFor("tips").sort()).toEqual(["info-domestic", "info-international", "tips"].sort());
    expect(categorySlugsFor("free")).toEqual(["free", "qna"]);
  });

  it("returns just the canonical slug when nothing merged into it", () => {
    expect(categorySlugsFor("companion")).toEqual(["companion"]);
  });
});

describe("normalizeCommunityCategory", () => {
  it("passes a current slug through unchanged", () => {
    expect(normalizeCommunityCategory("free")).toBe("free");
  });

  it("maps a legacy slug to its merged category — editing an old post won't fail to re-save", () => {
    expect(normalizeCommunityCategory("qna")).toBe("free");
    expect(normalizeCommunityCategory("info-international")).toBe("tips");
  });

  it("falls back to the first category for a value that's neither current nor a known legacy alias", () => {
    expect(normalizeCommunityCategory("nonsense")).toBe("free");
  });
});
