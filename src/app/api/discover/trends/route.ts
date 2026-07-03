import { NextRequest, NextResponse } from "next/server";
import {
  DISCOVER_DATA,
  allSpots,
  routeMatches,
  seasonNow,
  spotMatches,
  type DiscoverScope,
} from "@/lib/discoverData";

// ISR-style caching: identical to /api/trends and /api/planner/trends —
// this curated feed doesn't need to be recomputed on every request.
export const revalidate = 3600;

/**
 * Discover feed endpoint — branches by scope (국내/해외) the same way
 * /api/places/search branches by region, and additionally supports:
 *  - `category=season|hot|region` — pre-filters the trending/favorites lists
 *  - `region=<substring>` — narrows the "region" category to one area
 *  - `q=<text>` — free-text search across every spot + route in the scope,
 *    returning routes sorted by likes (the "인기 루트" ranking) alongside a
 *    category-grouped place list, instead of the unfiltered browse bundle.
 */
export async function GET(request: NextRequest) {
  const scope: DiscoverScope = request.nextUrl.searchParams.get("scope") === "overseas" ? "overseas" : "domestic";
  const category = request.nextUrl.searchParams.get("category") ?? "all";
  const region = request.nextUrl.searchParams.get("region");
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();

  const bundle = DISCOVER_DATA[scope];
  const regions = Array.from(new Set(allSpots(scope).map((s) => s.region.split(" · ")[0])));

  if (query) {
    const spots = allSpots(scope).filter((s) => spotMatches(s, query));
    const routes = bundle.routes.filter((r) => routeMatches(r, query)).sort((a, b) => b.likes - a.likes);
    return NextResponse.json({ results: { spots, routes } });
  }

  const season = seasonNow();
  let trending = bundle.trending;
  let favorites = bundle.favorites;

  if (category === "season") {
    trending = trending.filter((s) => s.season === season);
    favorites = favorites.filter((s) => s.season === season);
  } else if (category === "hot") {
    trending = [...trending].sort((a, b) => b.saves - a.saves);
    favorites = [];
  } else if (category === "region" && region) {
    trending = trending.filter((s) => s.region.startsWith(region));
    favorites = favorites.filter((s) => s.region.startsWith(region));
  }

  return NextResponse.json({
    bundle: { trending, favorites, routes: bundle.routes },
    regions,
    season,
  });
}
