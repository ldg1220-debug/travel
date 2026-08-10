import { NextRequest, NextResponse } from "next/server";
import {
  DISCOVER_DATA,
  allSpots,
  isPlaceholderSpot,
  matchesRegionPath,
  parseSearchQuery,
  regionHierarchy,
  resolveLeafCityCoords,
  routeMatches,
  routeMatchesRegionPath,
  seasonNow,
  spotMatches,
  type CuisineTag,
  type DiscoverRoute,
  type DiscoverScope,
  type DiscoverSpot,
  type PlaceCategoryTag,
} from "@/lib/discoverData";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { fetchLiveBrowseSpots } from "@/lib/server/discoverLiveBrowse";

// #164 — 지역별 드릴다운이 라이브 검색(discoverLiveBrowse.ts)으로 채워질
// 수 있게 되면서 이 라우트의 응답이 더 이상 항상 정적이지 않다. 예전
// (revalidate=3600, ISR 스타일 라우트 캐시)엔 순수 정적 큐레이션 데이터만
// 있어 안전했지만, 이제 같은 URL이 "지금은 coming_soon 폴백" → "이번엔
// 라이브 결과" 처럼 다른 내용을 돌려줄 수 있는데 Next의 풀 라우트 캐시가
// 그 위에 한 번 더 캐싱을 얹으면(place_candidate_cache의 자체 7일
// 캐시와 별개로) 프리뷰/엣지 환경에서 배포 시점에 따라 일관성 없는
// 응답이 굳어질 수 있다(라이브 결과가 프리뷰에서 간헐적으로 안 보이던
// 문제의 유력한 원인). /api/places/search가 이미 같은 이유로
// force-dynamic을 쓰고 있어 그 전례를 따른다 — 실제 API 호출 비용은
// fetchSlotCandidates 자체 캐시가 여전히 흡수하므로 이 라우트의
// 재계산 자체는 가볍다(정적 분기는 순수 인메모리 필터, 라이브 분기는
// place_candidate_cache 조회 위주).
export const dynamic = "force-dynamic";

const FALLBACK_COUNT = 4;
/** "Trending Now" reads as a dead section with 1-2 lonely cards after a narrow region/season filter — always pad it out to at least this many. */
const MIN_TRENDING_COUNT = 4;
const DEFAULT_PAGE_LIMIT = 10;

const SPOT_TAGS: PlaceCategoryTag[] = ["관광지", "테마파크", "음식점", "술집", "박물관", "카페", "자연", "쇼핑", "숙소"];
const CUISINE_TAGS: CuisineTag[] = ["일식", "한식", "양식/아시안", "카페/디저트"];
/** Route titles/subtitles containing any of these read as food-relevant — boosted to the top when the search intent is 음식점. */
const FOOD_ROUTE_KEYWORDS = ["먹방", "맛집", "카페", "미식", "맛"];

/** "Trending Now" reads thin after a narrow filter — pad it from the same-filtered favorites (not already shown) up to `min`, instead of leaving 1-2 lonely cards. */
function padTrending(trending: DiscoverSpot[], favorites: DiscoverSpot[], min: number): DiscoverSpot[] {
  if (trending.length >= min) return trending;
  const ids = new Set(trending.map((s) => s.id));
  const padding = favorites.filter((s) => !ids.has(s.id)).slice(0, min - trending.length);
  return [...trending, ...padding];
}

/** When the search intent is 음식점, routes about food (먹방/맛집/카페 in the title or subtitle) rank first — otherwise "경주 맛집" surfaces an unrelated "역사 탐방 코스" above anything actually food-related. */
function sortRoutesForIntent(routes: DiscoverRoute[], effectiveCategory: string): DiscoverRoute[] {
  if (effectiveCategory !== "음식점") return [...routes].sort((a, b) => b.likes - a.likes);
  const isFoodRoute = (r: DiscoverRoute) => FOOD_ROUTE_KEYWORDS.some((k) => `${r.title} ${r.subtitle}`.includes(k));
  return [...routes].sort((a, b) => {
    const aFood = isFoodRoute(a) ? 1 : 0;
    const bFood = isFoodRoute(b) ? 1 : 0;
    if (aFood !== bFood) return bFood - aFood;
    return b.likes - a.likes;
  });
}

/**
 * Discover feed endpoint — branches by scope (국내/해외) the same way
 * /api/places/search branches by region, and additionally supports:
 *  - `category=season|hot|region` — pre-filters the trending/favorites lists
 *  - `path=<continent>,<country>,<city>` (overseas) or `path=<region>,<neighborhood>`
 *    (domestic) — the 지역별 category's 대륙→국가→도시 (or 시도→동네) drill-down.
 *    If a fully-drilled-down path comes back with nothing, falls back one
 *    path segment at a time (city -> country -> scope-wide) with a "준비
 *    중" notice, so a leaf with no data shows nearby real recommendations
 *    instead of unrelated ones.
 *  - `q=<text>` — free-text, server-side-paginated search across every
 *    spot + route in the scope. Recognizes intent keywords ("경주 밥집")
 *    and specific dish names ("오사카 라멘") via parseSearchQuery — the
 *    actual place match runs against the keyword-stripped core query.
 *    `tag=<PlaceCategoryTag>` explicitly overrides the detected intent
 *    (defaults to it, then "all"); `cuisine=<CuisineTag>` further narrows
 *    음식점 results. `page`/`limit` (default 1/10) paginate the matched
 *    spot list server-side — only the current page is ever computed/sent,
 *    same shape a real Places API paged response would use
 *    (`hasMore`/`nextPageToken`) so swapping in a live API later is a
 *    drop-in replacement rather than a redesign.
 */
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const scope: DiscoverScope = request.nextUrl.searchParams.get("scope") === "overseas" ? "overseas" : "domestic";
  const category = request.nextUrl.searchParams.get("category") ?? "all";
  const pathParam = request.nextUrl.searchParams.get("path");
  const path = pathParam ? pathParam.split(",").filter(Boolean) : [];
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();

  const bundle = DISCOVER_DATA[scope];
  const regionTree = regionHierarchy(scope);

  if (query) {
    const { coreQuery, intentTag } = parseSearchQuery(query);

    const tagParam = request.nextUrl.searchParams.get("tag");
    const explicitTag = tagParam && (SPOT_TAGS as string[]).includes(tagParam) ? (tagParam as PlaceCategoryTag) : null;
    const effectiveCategory: PlaceCategoryTag | "all" = explicitTag ?? intentTag ?? "all";

    const cuisineParam = request.nextUrl.searchParams.get("cuisine");
    const effectiveCuisine = cuisineParam && (CUISINE_TAGS as string[]).includes(cuisineParam) ? (cuisineParam as CuisineTag) : null;

    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
    const limit = Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_PAGE_LIMIT);

    // A query that was *only* an intent keyword ("맛집" with no city) has
    // nothing left to text-match — fall back to every spot of that
    // category scope-wide instead of returning zero results. Template-
    // generated placeholder spots (isPlaceholderSpot) are excluded from
    // text matches — a generic name like "대전 한우 구이집" can
    // coincidentally token-match a query and read as a real business hit
    // when it isn't one; they're still fine to show while just browsing.
    let matched = coreQuery
      ? allSpots(scope).filter((s) => !isPlaceholderSpot(s) && spotMatches(s, coreQuery))
      : intentTag
        ? allSpots(scope).filter((s) => s.tag === intentTag)
        : [];
    if (effectiveCategory !== "all") matched = matched.filter((s) => s.tag === effectiveCategory);
    if (effectiveCategory === "음식점" && effectiveCuisine) matched = matched.filter((s) => s.cuisine === effectiveCuisine);

    const total = matched.length;
    const start = (page - 1) * limit;
    const pagedSpots = matched.slice(start, start + limit);
    const hasMore = start + limit < total;

    const routes = coreQuery ? sortRoutesForIntent(bundle.routes.filter((r) => routeMatches(r, coreQuery)), effectiveCategory) : [];

    return NextResponse.json({
      results: { spots: pagedSpots, routes },
      intentTag,
      appliedCategory: effectiveCategory,
      pagination: {
        page,
        limit,
        total,
        hasMore,
        // Mocked for shape-compatibility with a real Places API paged
        // response — this app drives paging off `page` directly, but a
        // live API swap would just start honoring the token instead.
        nextPageToken: hasMore ? Buffer.from(String(page + 1)).toString("base64") : null,
      },
    });
  }

  const season = seasonNow();
  let trending = bundle.trending;
  let favorites = bundle.favorites;
  let routes = bundle.routes;
  let notice: "coming_soon" | "live" | null = null;

  // 계절/핫한 are combinable check-filters (each stacks on top of a region
  // drill-down); the legacy exclusive `category` values keep working by
  // implying the matching check.
  const seasonCheck = request.nextUrl.searchParams.get("season") === "1" || category === "season";
  const hotCheck = request.nextUrl.searchParams.get("hot") === "1" || category === "hot";
  const regionActive = (category === "region" || category === "all") && path.length > 0;

  if (regionActive) {
    trending = trending.filter((s) => matchesRegionPath(s, scope, path));
    favorites = favorites.filter((s) => matchesRegionPath(s, scope, path));
    routes = bundle.routes.filter((r) => routeMatchesRegionPath(r, scope, path));

    // 큐레이션이 아예 없는 leaf뿐 아니라, 템플릿 제거(#164) 후 소수만
    // 남은 "혼합 지역"(예: 서울·성수 — 11곳 중 1곳만 실존, 프리뷰
    // 실측에서 이런 지역이 카드 1장만 보여주는 문제로 확인됨)도 라이브로
    // 보강한다. 카드 그리드가 한 줄에 4장(grid-cols-2 md:grid-cols-4)이라
    // 두 줄(8장) 미만이면 "성기다"고 본다.
    const MIN_REGION_SPOTS = 8;
    const curatedCount = trending.length + favorites.length;
    if (curatedCount < MIN_REGION_SPOTS) {
      // path가 도시 하나를 정확히 가리켜야(대륙/국가 단계처럼 넓은
      // path는 대상 아님) 라이브 검색 앵커 좌표를 찾을 수 있다.
      const leafCity = resolveLeafCityCoords(scope, path);
      const existingNames = [...trending, ...favorites].map((s) => s.name);
      const liveSpots = leafCity
        ? await fetchLiveBrowseSpots(scope, leafCity.city, leafCity.region, MIN_REGION_SPOTS, existingNames)
        : [];
      if (liveSpots.length > 0) {
        // 큐레이션(있다면)을 앞에, 라이브를 뒤에 — 손으로 고른 편집
        // 추천의 우선순위를 보존한다. 이름 중복은 fetchLiveBrowseSpots가
        // excludeNames로 이미 걸렀다.
        trending = [...trending, ...favorites, ...liveSpots];
        favorites = [];
        // 라이브 결과가 섞였다는 걸 클라이언트가 알아야 "실시간 검색
        // 결과" 안내와 Google/Kakao 출처 표기를 붙일 수 있다 —
        // coming_soon(엉뚱한 지역 데이터로 물러남)과 달리 이 지역
        // 자체의 콘텐츠라는 점이 다르다.
        notice = "live";
        routes = [];
      } else if (curatedCount === 0) {
        // A fully-drilled-down (leaf) selection with nothing in it reads as
        // "this city/neighborhood isn't in our data yet" rather than "there's
        // nothing here" — fall back one path segment at a time (e.g. a city
        // with no data falls back to its country, not straight to
        // scope-wide) so the "준비 중" recommendations still feel nearby.
        // (라이브 검색이 API 키 부재/실패/빈 응답으로 아무것도 못 줬을
        // 때의 최종 안전망 — 폴백 자체는 그대로 유지.)
        notice = "coming_soon";
        let fallbackPath = path.slice(0, -1);
        let fallbackMatches: DiscoverSpot[] = [];
        while (fallbackPath.length > 0) {
          fallbackMatches = allSpots(scope).filter((s) => matchesRegionPath(s, scope, fallbackPath));
          if (fallbackMatches.length > 0) break;
          fallbackPath = fallbackPath.slice(0, -1);
        }
        trending = (fallbackMatches.length > 0 ? fallbackMatches : [...allSpots(scope)]).sort((a, b) => b.saves - a.saves).slice(0, FALLBACK_COUNT);
        favorites = [];
        routes = fallbackPath.length > 0 ? bundle.routes.filter((r) => routeMatchesRegionPath(r, scope, fallbackPath)) : [];
      }
    }
  }

  if (seasonCheck && notice === null) {
    const st = trending.filter((s) => s.season === season);
    const sf = favorites.filter((s) => s.season === season);
    // Region + season can legitimately intersect to nothing — keep the
    // region results rather than showing an empty page.
    if (st.length + sf.length > 0) {
      trending = st;
      favorites = sf;
    }
  }
  if (hotCheck) {
    trending = [...trending].sort((a, b) => b.saves - a.saves);
    favorites = [...favorites].sort((a, b) => b.saves - a.saves);
    // Legacy hot-only view showed a single ranked list.
    if (!regionActive && !seasonCheck) favorites = [];
  }
  if (notice === null) trending = padTrending(trending, favorites, MIN_TRENDING_COUNT);

  return NextResponse.json({
    bundle: { trending, favorites, routes },
    regionTree,
    season,
    notice,
  });
});
