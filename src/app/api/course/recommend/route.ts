import { NextRequest, NextResponse } from "next/server";
import type { Place } from "@/lib/types";
import { withApiErrorHandling } from "@/lib/server/apiHandler";
import { curateCourseWithLlm, type CourseSlotCandidates } from "@/lib/server/courseLlm";
import { generateCourseV2, type GenerateCourseAnchor } from "@/lib/server/courseRecommendV2";
import {
  THEME_SLOTS,
  THEME_LABELS,
  parseTheme,
  fetchSlotCandidates,
  pickDeterministic,
  sameShop,
  parseTravelRadius,
  parseTravelMode,
  parseTimeToMinutes,
  radiusKmFor,
  isWithinRadius,
  hasWithinRadiusCandidate,
  type RecommendSlot,
} from "@/lib/server/courseRecommend";

/** `{start,end}Id`/`Name`/`Lat`/`Lng` 4개가 모두 유효할 때만 앵커로 인정 — 하나라도 빠지면(예: 이름은 있는데 좌표가 안 실림) 조용히 무시하고 기존(앵커 없음) 동작으로 폴백한다. */
function parseAnchorParam(params: URLSearchParams, prefix: "start" | "end"): GenerateCourseAnchor | undefined {
  const id = params.get(`${prefix}Id`);
  const name = params.get(`${prefix}Name`);
  const lat = Number(params.get(`${prefix}Lat`));
  const lng = Number(params.get(`${prefix}Lng`));
  if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { id: id.slice(0, 200), name: name.slice(0, 100), lat, lng };
}

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
  const radius = parseTravelRadius(request.nextUrl.searchParams.get("radius"));
  const maxDistanceKm = radiusKmFor(radius);
  if (!city) return NextResponse.json({ error: "missing city" }, { status: 400 });

  // v2(courseRoute.ts의 DP 기반 역할 분리 파이프라인) — v1과 나란히 존재,
  // 비교 테스트 중에는 COURSE_PIPELINE=v2일 때만 탄다. 클라이언트는 아직
  // courseId를 안 보내므로(리롤 시 필요) 실사용자 트래픽에 이 플래그를
  // 켜기 전엔 클라이언트도 함께 업데이트해야 한다 — INTEGRATION.md 참고.
  if (process.env.COURSE_PIPELINE === "v2") {
    const mode = parseTravelMode(request.nextUrl.searchParams.get("mode"));
    const startMinutes = parseTimeToMinutes(request.nextUrl.searchParams.get("startTime"));
    const endMinutes = parseTimeToMinutes(request.nextUrl.searchParams.get("endTime"));
    const startAnchor = parseAnchorParam(request.nextUrl.searchParams, "start");
    const endAnchor = parseAnchorParam(request.nextUrl.searchParams, "end");
    // 다일정(멀티데이) 클라이언트가 이전 날짜에 이미 쓴 장소 id/이름·
    // 지금까지 배정된 스팟들의 중심 좌표를 여기로 넘긴다 — id는 reroll
    // route의 excludeIds와 같은 형식(콤마 구분), 이름은 URI 인코딩.
    const excludeIdsParam = request.nextUrl.searchParams.get("excludeIds");
    const excludeIds = excludeIdsParam ? new Set(excludeIdsParam.split(",").filter(Boolean)) : undefined;
    const excludeNamesParam = request.nextUrl.searchParams.get("excludeNames");
    const excludeNames = excludeNamesParam ? excludeNamesParam.split(",").filter(Boolean).map((n) => decodeURIComponent(n)) : undefined;
    const avoidLat = Number(request.nextUrl.searchParams.get("avoidLat"));
    const avoidLng = Number(request.nextUrl.searchParams.get("avoidLng"));
    const avoidCentroid = Number.isFinite(avoidLat) && Number.isFinite(avoidLng) && (avoidLat || avoidLng) ? { lat: avoidLat, lng: avoidLng } : undefined;
    return NextResponse.json(
      await generateCourseV2(scope, city, theme, radius, {
        mode,
        ...(startMinutes != null && endMinutes != null && endMinutes > startMinutes ? { startMinutes, endMinutes } : {}),
        startAnchor,
        endAnchor,
        excludeIds,
        excludeNames,
        avoidCentroid,
      }),
    );
  }

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
