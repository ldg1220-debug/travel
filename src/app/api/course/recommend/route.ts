import { NextRequest, NextResponse } from "next/server";
import type { Place } from "@/lib/types";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { curateCourseWithLlm, type CourseSlotCandidates } from "@/lib/server/courseLlm";
import {
  THEME_SLOTS,
  THEME_LABELS,
  parseTheme,
  fetchSlotCandidates,
  pickDeterministic,
  sameShop,
  parseTravelRadius,
  radiusKmFor,
  isWithinRadius,
  hasWithinRadiusCandidate,
  type RecommendSlot,
} from "@/lib/server/courseRecommend";

export const dynamic = "force-dynamic";

/**
 * "AI 추천 동선" — auto-assembles an ordered day course for a city, like
 * 경복궁 → 광장시장 → 점심 → 익선동 → 청계천 야경 → 저녁. The Places/Kakao
 * APIs have no route-planning endpoint, so this composes one from real
 * data: for each course slot it runs a live search and gathers a candidate
 * pool (see src/lib/server/courseRecommend.ts). Then:
 *  - If LLM_API_KEY is set, Claude curates the pools into a coherent day
 *    (picking + ordering + a one-line reason per stop) — see courseLlm.ts.
 *  - Otherwise a deterministic ranker picks the top place per slot by a
 *    rating×review score minus a travel-distance penalty from the previous
 *    stop (keeps the day walkable), varying the pick among the top few so
 *    re-running gives a different course.
 * Either way the result is a genuine, ranked itinerary of real places.
 *
 * A `theme` param reshapes the day (미식/힐링·감성/역사·문화/액티비티) so the
 * same city no longer always returns the identical 7-slot skeleton. Once
 * shown, each stop can be individually removed or rerolled via
 * /api/course/recommend/reroll without regenerating the whole day.
 */

/** The assembled course entry the client renders on the timeline. */
type FinalStop = Place & { slotKey: string; slotLabel: string; hour: number; meal: boolean; reason?: string };

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const scope = request.nextUrl.searchParams.get("scope") === "domestic" ? "domestic" : "overseas";
  const city = (request.nextUrl.searchParams.get("city") ?? "").trim().slice(0, 40);
  const theme = parseTheme(request.nextUrl.searchParams.get("theme"));
  const maxDistanceKm = radiusKmFor(parseTravelRadius(request.nextUrl.searchParams.get("radius")));
  if (!city) return NextResponse.json({ error: "missing city" }, { status: 400 });

  const slots = THEME_SLOTS[theme];

  // ── 1. Gather a candidate pool per slot from live search. ──
  const pools: { slot: RecommendSlot; candidates: Place[] }[] = [];
  for (const slot of slots) {
    pools.push({ slot, candidates: await fetchSlotCandidates(scope, city, slot) });
  }
  if (pools.every((p) => p.candidates.length === 0)) {
    return NextResponse.json({ course: [], source: "mock", theme });
  }

  // ── 2. Optional LLM curation over the pools (null → deterministic). ──
  const llmSlots: CourseSlotCandidates[] = pools.map(({ slot, candidates }) => ({
    slotKey: slot.key,
    slotLabel: slot.label,
    candidates: candidates.map((c) => ({ id: c.id, name: c.name, rating: c.rating, reviews: c.reviewCount, category: c.category })),
  }));
  const llmPicks = await curateCourseWithLlm(city, THEME_LABELS[theme], llmSlots);

  // ── 3. Assemble the day. Prefer the LLM's pick per slot; fall back to the
  //       deterministic ranker for any slot the LLM skipped or that collided
  //       with an already-used place. ──
  const used = new Set<string>();
  const course: FinalStop[] = [];
  for (const { slot, candidates } of pools) {
    const anchor = course.length > 0 ? { lat: course[course.length - 1].lat, lng: course[course.length - 1].lng } : null;
    const llmPick = llmPicks?.find((p) => p.slotKey === slot.key);
    let chosen: Place | undefined;
    if (llmPick) {
      const c = candidates.find((cand) => cand.id === llmPick.id);
      // Reject an LLM pick that lands outside the selected travel radius
      // when a closer alternative exists — the LLM has no distance
      // awareness (candidates aren't given lat/lng), so without this the
      // radius option would only ever apply to the no-LLM-key fallback.
      const acceptable =
        c && !used.has(c.id) && !course.some((s) => sameShop(s.name, c.name)) &&
        (isWithinRadius(c, anchor, maxDistanceKm) || !hasWithinRadiusCandidate(candidates, used, course.map((s) => s.name), anchor, maxDistanceKm));
      if (acceptable) chosen = c;
    }
    if (!chosen) {
      chosen = pickDeterministic(candidates, used, course.map((s) => s.name), anchor, maxDistanceKm);
    }
    if (!chosen) continue;
    used.add(chosen.id);
    course.push({
      ...chosen,
      slotKey: slot.key,
      slotLabel: slot.label,
      hour: slot.hour,
      meal: Boolean(slot.meal),
      ...(llmPick?.reason ? { reason: llmPick.reason } : {}),
    });
  }

  const source = llmPicks ? "llm" : scope === "overseas" ? "google" : "kakao";
  return NextResponse.json({ course, source, theme });
});
