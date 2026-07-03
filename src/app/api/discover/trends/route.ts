import { NextRequest, NextResponse } from "next/server";
import {
  DISCOVER_DATA,
  allSpots,
  matchesRegionPath,
  parseSearchQuery,
  regionHierarchy,
  routeMatches,
  seasonNow,
  spotMatches,
  type DiscoverScope,
} from "@/lib/discoverData";

// ISR-style caching: identical to /api/trends and /api/planner/trends —
// this curated feed doesn't need to be recomputed on every request.
export const revalidate = 3600;

const FALLBACK_COUNT = 4;

/**
 * Discover feed endpoint — branches by scope (국내/해외) the same way
 * /api/places/search branches by region, and additionally supports:
 *  - `category=season|hot|region` — pre-filters the trending/favorites lists
 *  - `path=<continent>,<country>,<city>` (overseas) or `path=<region>,<neighborhood>`
 *    (domestic) — the 지역별 category's 대륙→국가→도시 (or 시도→동네) drill-down.
 *    If a fully-drilled-down path comes back with nothing, falls back to a
 *    "준비 중" notice + a scope-wide popular-spots list instead of an empty screen.
 *  - `q=<text>` — free-text search across every spot + route in the scope,
 *    returning routes sorted by likes (the "인기 루트" ranking) alongside a
 *    category-grouped place list, instead of the unfiltered browse bundle.
 *    Recognizes trailing/embedded intent keywords ("경주 밥집", "숙소
 *    호텔") via parseSearchQuery — the actual place match runs against
 *    the keyword-stripped core query, and the detected category comes
 *    back as `intentTag` so the client can auto-activate that filter
 *    chip on the results page.
 */
export async function GET(request: NextRequest) {
  const scope: DiscoverScope = request.nextUrl.searchParams.get("scope") === "overseas" ? "overseas" : "domestic";
  const category = request.nextUrl.searchParams.get("category") ?? "all";
  const pathParam = request.nextUrl.searchParams.get("path");
  const path = pathParam ? pathParam.split(",").filter(Boolean) : [];
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();

  const bundle = DISCOVER_DATA[scope];
  const regionTree = regionHierarchy(scope);

  if (query) {
    const { coreQuery, intentTag } = parseSearchQuery(query);
    // A query that was *only* an intent keyword ("맛집" with no city) has
    // nothing left to text-match — fall back to every spot of that
    // category scope-wide instead of returning zero results.
    const spots = coreQuery
      ? allSpots(scope).filter((s) => spotMatches(s, coreQuery))
      : intentTag
        ? allSpots(scope).filter((s) => s.tag === intentTag)
        : [];
    const routes = coreQuery ? bundle.routes.filter((r) => routeMatches(r, coreQuery)).sort((a, b) => b.likes - a.likes) : [];
    return NextResponse.json({ results: { spots, routes }, intentTag });
  }

  const season = seasonNow();
  let trending = bundle.trending;
  let favorites = bundle.favorites;
  let notice: "coming_soon" | null = null;

  if (category === "season") {
    trending = trending.filter((s) => s.season === season);
    favorites = favorites.filter((s) => s.season === season);
  } else if (category === "hot") {
    trending = [...trending].sort((a, b) => b.saves - a.saves);
    favorites = [];
  } else if (category === "region" && path.length > 0) {
    trending = trending.filter((s) => matchesRegionPath(s, scope, path));
    favorites = favorites.filter((s) => matchesRegionPath(s, scope, path));

    // A fully-drilled-down (leaf) selection with nothing in it reads as
    // "this city/neighborhood isn't in our data yet" rather than "there's
    // nothing here" — show a 준비 중 notice plus the scope's overall
    // top-saved spots instead of a dead end.
    if (trending.length === 0 && favorites.length === 0) {
      notice = "coming_soon";
      trending = [...allSpots(scope)].sort((a, b) => b.saves - a.saves).slice(0, FALLBACK_COUNT);
      favorites = [];
    }
  }

  return NextResponse.json({
    bundle: { trending, favorites, routes: bundle.routes },
    regionTree,
    season,
    notice,
  });
}
