import type { Place } from "@/lib/types";
import { styleForCategory } from "@/lib/placeStyle";
import { scrapeMockSnsPosts } from "./mockScraper";
import { filterAuthenticPosts } from "./filters";
import { verifyReviewIsAuthentic } from "./llmVerifier";
import { resolvePlace } from "./placesMapping";
import { saveTrendingPlaces } from "./db";
import type { PipelineSummary, RawSnsPost, ResolvedPlace } from "./types";

/**
 * Runs the full trend pipeline once: scrape -> regex filter -> LLM
 * verification -> Places resolution -> DB write. Intended to be invoked on
 * a schedule (cron / GitHub Actions / Vercel Cron), not per user request —
 * that's what keeps Places API usage close to zero.
 */
export async function runTrendPipeline(): Promise<PipelineSummary> {
  const rawPosts = await scrapeMockSnsPosts();
  const candidatePosts = filterAuthenticPosts(rawPosts);

  const verifiedPosts: RawSnsPost[] = [];
  for (const post of candidatePosts) {
    const verdict = await verifyReviewIsAuthentic(post);
    if (verdict.isGenuine) verifiedPosts.push(post);
  }

  const places: Place[] = [];
  const seenPlaceIds = new Set<string>();
  for (const post of verifiedPosts) {
    const resolved = await resolvePlace(post.placeNameGuess);
    if (!resolved || seenPlaceIds.has(resolved.placeId)) continue;
    seenPlaceIds.add(resolved.placeId);
    places.push(toPlace(resolved, post));
  }

  await saveTrendingPlaces(places);

  return {
    scraped: rawPosts.length,
    passedRegexFilter: candidatePosts.length,
    passedLlmVerification: verifiedPosts.length,
    saved: places.length,
  };
}

function toPlace(resolved: ResolvedPlace, post: RawSnsPost): Place {
  const { color, icon } = styleForCategory(post.category, resolved.placeId);
  return {
    id: resolved.placeId,
    placeId: resolved.placeId,
    name: resolved.name,
    category: post.category,
    color,
    lat: resolved.lat,
    lng: resolved.lng,
    rating: resolved.rating,
    icon,
  };
}
