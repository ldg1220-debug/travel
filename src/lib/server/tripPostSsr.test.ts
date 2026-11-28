import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/server/db", () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

import { fetchPublicTripPostArticle } from "./postMetadata";
import { buildTripPostJsonLd, clipContent, matchIndexedCourseLink, regionLabel, serializeJsonLd, summarizeDays, tripPostCanonical } from "../tripPostSeo";

const row = (visibility: string) => ({
  id: 5,
  title: "오사카 3박 4일",
  content: "공항 도착하자마자 짐 배송을 맡겼다.",
  images: ["https://img/1.jpg", 3],
  visibility,
  authorName: "여행자",
  region: "osaka",
  tripTitle: "오사카",
  coursesSnapshot: { title: "오사카", region: "osaka", items: [{ id: "a", name: "도톤보리", date: "2026-05-01" }, { id: "b", name: "오사카성", date: "2026-05-02" }] },
  createdAt: "2026-05-10T00:00:00Z",
  updatedAt: "2026-05-11T00:00:00Z",
});

beforeEach(() => queryMock.mockReset());

describe("fetchPublicTripPostArticle", () => {
  it("공개 글 → 본문·일정·이미지가 담긴다", async () => {
    queryMock.mockResolvedValue({ rows: [row("public")] });
    const a = await fetchPublicTripPostArticle(5);
    expect(a?.content).toContain("공항 도착하자마자 짐 배송");
    expect(a?.images).toEqual(["https://img/1.jpg"]);
    expect(a?.days).toEqual([
      { date: "2026-05-01", names: ["도톤보리"] },
      { date: "2026-05-02", names: ["오사카성"] },
    ]);
  });

  it.each(["private", "friends", "custom"])("%s 글 → null (본문 미노출)", async (v) => {
    queryMock.mockResolvedValue({ rows: [row(v)] });
    expect(await fetchPublicTripPostArticle(5)).toBeNull();
  });

  it("없는 글·잘못된 id → null", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await fetchPublicTripPostArticle(9)).toBeNull();
    expect(await fetchPublicTripPostArticle(0)).toBeNull();
  });
});

describe("tripPostSeo", () => {
  it("canonical 은 www 절대 URL", () => {
    expect(tripPostCanonical(5)).toBe("https://www.tradule.co.kr/trip/5");
  });

  it("JSON-LD 는 headline·날짜·이미지만, 평점 없음 + < 이스케이프", async () => {
    queryMock.mockResolvedValue({ rows: [{ ...row("public"), title: "</script>제목" }] });
    const a = (await fetchPublicTripPostArticle(5))!;
    const ld = buildTripPostJsonLd(a);
    expect(ld["@type"]).toBe("Article");
    expect(ld.datePublished).toBe("2026-05-10T00:00:00.000Z");
    expect(ld.dateModified).toBe("2026-05-11T00:00:00.000Z");
    expect(JSON.stringify(ld)).not.toMatch(/rating/i);
    expect(serializeJsonLd(ld)).not.toContain("</script>");
  });

  it("긴 본문은 잘리고 빈 스냅샷은 빈 배열", () => {
    expect(clipContent("가".repeat(2000)).length).toBe(1501);
    expect(summarizeDays(null)).toEqual([]);
  });
});

describe("regionLabel / matchIndexedCourseLink", () => {
  it("지역 코드를 한글로, 알 수 없는 값은 빈 값", () => {
    expect(regionLabel("domestic")).toBe("국내");
    expect(regionLabel("international")).toBe("해외");
    expect(regionLabel("overseas")).toBe("해외");
    expect(regionLabel("mars")).toBe("");
    expect(regionLabel(null)).toBe("");
  });
  it("제목에 색인 여행지가 있으면 코스 링크, 없으면 null", () => {
    expect(matchIndexedCourseLink("5월22일 ~ 26일 후쿠오카")?.href).toBe("/course/" + encodeURIComponent("후쿠오카") + "/" + encodeURIComponent("2박3일"));
    expect(matchIndexedCourseLink("0711 오사카")?.region).toBe("오사카");
    expect(matchIndexedCourseLink("7월18일 동래")).toBeNull();
    expect(matchIndexedCourseLink(null)).toBeNull();
  });
});
