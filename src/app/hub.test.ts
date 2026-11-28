import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ConfirmedCoursePage } from "@/lib/server/coursePageIndex";

const confirmedMock = vi.fn<() => Promise<ConfirmedCoursePage[]>>();
vi.mock("@/lib/server/coursePageIndex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/coursePageIndex")>();
  return { ...actual, fetchConfirmedCoursePages: () => confirmedMock() };
});
vi.mock("@/lib/server/db", () => ({ pool: { query: vi.fn() } }));

import { PopularCoursesSection } from "@/components/PopularCoursesSection";
import CourseHubPage, { generateMetadata as hubMetadata } from "./(app)/course/all/page";
import { metadata as discoverMetadata } from "./(app)/discover/page";
import RegionHubPage, { generateMetadata as regionMetadata } from "./(app)/course/[region]/page";

// 작업지시서 2026-10-12 "코스 페이지가 고아입니다" §2 — 코스 허브·지역 허브·인기 코스 섹션.

const page = (region: string, days: number, extra: Partial<ConfirmedCoursePage> = {}): ConfirmedCoursePage => ({
  region,
  days: days as 1,
  lastModified: new Date("2026-10-12T00:00:00Z"),
  info: { spotCount: 12, totalDistanceKm: 22.9, imageUrl: `https://www.tradule.co.kr/api/blob/course-maps/${region}.png`, reps: [`${region} 명소1`, `${region} 명소2`] },
  ...extra,
});
const SAMPLE = [page("오사카", 2), page("오사카", 3), page("도쿄", 3), page("방콕", 4), page("서울", 2), page("경주", 2), page("후쿠오카", 3), page("교토", 3), page("삿포로", 3), page("다낭", 4), page("제주", 3), page("부산", 2)];

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
const titleOf = (m: { title?: unknown }) => (typeof m.title === "string" ? m.title : String((m.title as { absolute?: string })?.absolute ?? ""));

beforeEach(() => confirmedMock.mockReset());

describe("코스 허브 /course/all", () => {
  it("확인된 코스 조합마다 정적 링크 1개 — 사이트맵과 같은 수, 비공개 경로(/planner·/trip·course-open) 링크 없음", async () => {
    confirmedMock.mockResolvedValue(SAMPLE);
    const html = renderToStaticMarkup(await CourseHubPage());
    const courseLinks = hrefs(html).filter((h) => /^\/course\/[^/]+\/[^/]+$/.test(h));
    expect(courseLinks).toHaveLength(SAMPLE.length);
    expect(new Set(courseLinks).size).toBe(SAMPLE.length);
    expect(hrefs(html).some((h) => h.startsWith("/planner") || h.startsWith("/trip/") || h.includes("course-open"))).toBe(false);
    expect(html).toContain("오사카"); // 지역 카드
    expect(html).toContain("오사카 명소1 · 오사카 명소2"); // 대표 명소 2곳
    expect(html).toContain("/api/blob/course-maps/"); // 지도 썸네일
    expect(html).toContain("emrldtp.com"); // Drive 로드
    expect(hrefs(html)).toContain("/course/오사카"); // 지역 허브 링크
  });

  it("title: '여행 코스 모음 — {N}개 도시 · 일자별 동선 | 트레쥴', canonical /course/all", async () => {
    confirmedMock.mockResolvedValue(SAMPLE);
    const meta = await hubMetadata();
    expect(titleOf(meta)).toBe("여행 코스 모음 — 11개 도시 · 일자별 동선 | 트레쥴");
    expect(meta.alternates?.canonical).toBe("/course/all");
  });

  it("JSON-LD: CollectionPage ItemList(코스 URL 전부) + BreadcrumbList", async () => {
    confirmedMock.mockResolvedValue(SAMPLE);
    const html = renderToStaticMarkup(await CourseHubPage());
    expect(html).toContain("CollectionPage");
    expect(html).toContain("BreadcrumbList");
    expect(html.match(/ListItem/g)!.length).toBeGreaterThanOrEqual(SAMPLE.length);
  });

  it("국내 → 해외 순서로 묶는다", async () => {
    confirmedMock.mockResolvedValue(SAMPLE);
    const html = renderToStaticMarkup(await CourseHubPage());
    expect(html.indexOf("국내")).toBeLessThan(html.indexOf("해외"));
  });
});

describe("인기 여행 코스 섹션 (홈·/discover·/course)", () => {
  it("8~12개 링크 + '전체 보기 → 허브', 지역당 1개", async () => {
    confirmedMock.mockResolvedValue(SAMPLE);
    const html = renderToStaticMarkup(await PopularCoursesSection({}));
    const links = hrefs(html);
    const courseLinks = links.filter((h) => /^\/course\/[^/]+\/[^/]+$/.test(h));
    expect(courseLinks.length).toBeGreaterThanOrEqual(8);
    expect(courseLinks.length).toBeLessThanOrEqual(12);
    expect(new Set(courseLinks.map((h) => h.split("/")[2])).size).toBe(courseLinks.length); // 지역당 1개
    expect(links).toContain("/course/all");
    expect(courseLinks).toContain("/course/오사카/2박3일"); // 대표 1순위 일수 카드
  });

  it("확인된 조합이 없으면 아무것도 그리지 않는다", async () => {
    confirmedMock.mockResolvedValue([]);
    expect(await PopularCoursesSection({})).toBeNull();
  });
});

describe("지역 허브 /course/{지역}", () => {
  const render = async (region: string) => renderToStaticMarkup(await RegionHubPage({ params: Promise.resolve({ region }) }));

  it("그 지역의 모든 일수 링크 + 곳 수·km + 브레드크럼(홈 > 허브 > 지역)", async () => {
    confirmedMock.mockResolvedValue(SAMPLE);
    const html = await render("오사카");
    const links = hrefs(html);
    expect(links).toContain("/course/오사카/1박2일");
    expect(links).toContain("/course/오사카/2박3일");
    // 관련 코스 <nav> 를 기준으로 분리: 카드 목록(바깥)에는 다른 지역 코스가 없고, nav 안에는 있다.
    const navStart = html.indexOf('<nav aria-label="관련 코스"');
    expect(navStart).toBeGreaterThan(-1);
    const navEnd = html.indexOf("</nav>", navStart);
    const outside = hrefs(html.slice(0, navStart) + html.slice(navEnd));
    const inside = hrefs(html.slice(navStart, navEnd));
    expect(outside).not.toContain("/course/도쿄/2박3일");
    expect(inside).toContain("/course/도쿄/2박3일");
    expect(html).toContain("12곳 · 이동 22.9km");
    expect(links).toContain("/course/all");
    expect(titleOf(await regionMetadata({ params: Promise.resolve({ region: "오사카" }) }))).toBe("오사카 여행 코스 — 1박2일~2박3일 일자별 동선 | 트레쥴");
  });

  it("확인된 조합이 없으면 200 빈 페이지 + noindex, 미지원 지역은 404, 별칭은 정본으로 리다이렉트", async () => {
    confirmedMock.mockResolvedValue([]);
    expect(await render("세부")).toContain("앱에서 이 지역 코스 만들기");
    const meta = await regionMetadata({ params: Promise.resolve({ region: "세부" }) });
    expect(meta.robots).toMatchObject({ index: false });
    await expect(render("아틀란티스")).rejects.toThrow();
    const alias = await render("발리").catch((e) => e as { digest?: string });
    expect(String((alias as { digest?: string }).digest)).toContain(encodeURIComponent("우붓"));
  });
});

// 작업지시서 2026-11-29 "허브 og:image 누락" — openGraph 정의가 layout 의 openGraph 를 교체하므로 images 를 직접 명시해야 한다.
describe("허브 공유 미리보기 이미지(og:image)", () => {
  const ogUrls = (m: { openGraph?: unknown }) => {
    const imgs = (m.openGraph as { images?: unknown } | undefined)?.images;
    return (Array.isArray(imgs) ? imgs : []).map((i) => (typeof i === "string" ? i : (i as { url: string }).url));
  };

  it("/course/all: 기본 /opengraph-image, locale ko_KR", async () => {
    confirmedMock.mockResolvedValue(SAMPLE);
    const meta = await hubMetadata();
    expect(ogUrls(meta)).toEqual(["/opengraph-image"]);
    expect((meta.openGraph as { locale?: string }).locale).toBe("ko_KR");
  });

  it("/course/{지역}: 대표 일수 코스의 지도 URL(상세 og:image 와 같은 값), twitter 도 동일", async () => {
    const url = "https://www.tradule.co.kr/api/content/course-map?region=오사카&days=3&v=abc";
    confirmedMock.mockResolvedValue([page("오사카", 2, { info: { spotCount: 8, totalDistanceKm: 10, imageUrl: "https://www.tradule.co.kr/api/content/course-map?region=오사카&days=2&v=zzz", reps: [] } }), page("오사카", 3, { info: { spotCount: 12, totalDistanceKm: 20, imageUrl: url, reps: [] } })]);
    const meta = await regionMetadata({ params: Promise.resolve({ region: "오사카" }) });
    expect(ogUrls(meta)).toEqual([url]);
    expect((meta.twitter as { images?: string[] }).images).toEqual([url]);
  });

  it("/course/{지역}: 지도가 없으면 /opengraph-image 폴백", async () => {
    confirmedMock.mockResolvedValue([page("오사카", 3, { info: undefined })]);
    const meta = await regionMetadata({ params: Promise.resolve({ region: "오사카" }) });
    expect(ogUrls(meta)).toEqual(["/opengraph-image"]);
    expect((meta.twitter as { images?: string[] }).images).toEqual(["/opengraph-image"]);
  });

  it("/discover: og:url=/discover + images 비어 있지 않음", () => {
    expect((discoverMetadata.openGraph as { url?: string }).url).toBe("/discover");
    expect(ogUrls(discoverMetadata).length).toBeGreaterThan(0);
  });
});
