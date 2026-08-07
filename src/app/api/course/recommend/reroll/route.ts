import { NextRequest, NextResponse } from "next/server";
import type { Place } from "@/lib/types";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { curateCourseWithLlm } from "@/lib/server/courseLlm";
import { rerollSlotV2 } from "@/lib/server/courseRecommendV2";
import {
  THEME_LABELS,
  parseTheme,
  findSlot,
  fetchSlotCandidates,
  pickDeterministic,
  parseTravelRadius,
  radiusKmFor,
  isWithinRadius,
  hasWithinRadiusCandidate,
} from "@/lib/server/courseRecommend";

export const dynamic = "force-dynamic";

/**
 * "다른 곳 추천" — regenerates a single stop of an already-built AI course
 * without touching the rest of the day. Reuses the exact same live search +
 * ranking (and optional LLM curation) as the full-day build in
 * course/recommend, just scoped to one slot.
 *
 * `excludeIds` (comma-separated) is every place id already on the current
 * course preview — including the stop being replaced — so the reroll never
 * suggests a duplicate of something already shown, and `excludeNames`
 * (comma-separated, URI-encoded) backs up the id check with the same
 * same-brand name guard the full build uses.
 */
type FinalStop = Place & { slotKey: string; slotLabel: string; hour: number; meal: boolean; reason?: string };

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const scope = params.get("scope") === "domestic" ? "domestic" : "overseas";
  const city = (params.get("city") ?? "").trim().slice(0, 40);
  const theme = parseTheme(params.get("theme"));
  const slotKey = params.get("slot") ?? "";

  // v2 — course/recommend가 courseId를 돌려줬을 때만 온다(위 route.ts 참고).
  // courseId가 있는데 COURSE_PIPELINE=v2가 아니거나, v2인데 courseId가
  // 없으면 클라이언트-서버 파이프라인 불일치이므로 명확히 에러로 알린다
  // (v1 폴백으로 조용히 넘기지 않음 — v1은 courseId 개념 자체가 없어 뒤섞이면
  // 디버깅이 어려워진다).
  const courseId = params.get("courseId");
  if (process.env.COURSE_PIPELINE === "v2") {
    if (!courseId) return NextResponse.json({ error: "courseId required for v2 pipeline" }, { status: 400 });
    return NextResponse.json(await rerollSlotV2(courseId, slotKey));
  }
  if (courseId) {
    return NextResponse.json({ error: "courseId given but COURSE_PIPELINE is not v2" }, { status: 400 });
  }
  const excludeIds = new Set((params.get("excludeIds") ?? "").split(",").filter(Boolean));
  const excludeNames = (params.get("excludeNames") ?? "").split(",").filter(Boolean).map((n) => decodeURIComponent(n));
  const anchorLat = Number(params.get("anchorLat"));
  const anchorLng = Number(params.get("anchorLng"));
  const anchor = Number.isFinite(anchorLat) && Number.isFinite(anchorLng) && (anchorLat || anchorLng) ? { lat: anchorLat, lng: anchorLng } : null;
  const maxDistanceKm = radiusKmFor(parseTravelRadius(params.get("radius")));

  if (!city) return NextResponse.json({ error: "missing city" }, { status: 400 });
  const slot = findSlot(theme, slotKey);
  if (!slot) return NextResponse.json({ error: "invalid slot" }, { status: 400 });

  const candidates = await fetchSlotCandidates(scope, city, slot);
  if (candidates.length === 0) return NextResponse.json({ stop: null, source: "mock" });

  const llmPicks = await curateCourseWithLlm(city, THEME_LABELS[theme], [
    {
      slotKey: slot.key,
      slotLabel: slot.label,
      candidates: candidates
        .filter((c) => !excludeIds.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, rating: c.rating, reviews: c.reviewCount, category: c.category })),
    },
  ]);
  const llmPick = llmPicks?.[0];

  let chosen: Place | undefined;
  let reason: string | undefined;
  if (llmPick) {
    const c = candidates.find((cand) => cand.id === llmPick.id && !excludeIds.has(cand.id));
    const acceptable =
      c && (isWithinRadius(c, anchor, maxDistanceKm) || !hasWithinRadiusCandidate(candidates, excludeIds, excludeNames, anchor, maxDistanceKm));
    if (acceptable) {
      chosen = c;
      reason = llmPick.reason;
    }
  }
  if (!chosen) chosen = pickDeterministic(candidates, excludeIds, excludeNames, anchor, maxDistanceKm);
  if (!chosen) return NextResponse.json({ stop: null, source: llmPicks ? "llm" : scope === "overseas" ? "google" : "kakao" });

  const stop: FinalStop = {
    ...chosen,
    slotKey: slot.key,
    slotLabel: slot.label,
    hour: slot.hour,
    meal: Boolean(slot.meal),
    ...(reason ? { reason } : {}),
  };
  return NextResponse.json({ stop, source: llmPick ? "llm" : scope === "overseas" ? "google" : "kakao" });
});
