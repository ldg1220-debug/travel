// src/lib/server/courseRecommendV2.ts
//
// "AI 추천 동선" v2 — Fable 검토를 반영한 역할 분리 파이프라인
// (LLM = 슬롯별 취향 큐레이션 / courseRoute.ts의 DP = 동선·반경·중복).
// v1(courseRecommend.ts + courseLlm.ts, 그리디+거리페널티)은 그대로 두고,
// process.env.COURSE_PIPELINE === "v2"일 때만 이 모듈을 탄다 — 두 파이프라인이
// 나란히 존재하는 동안 같은 도시/테마로 결과를 비교해보고, v2가 명확히
// 낫다고 판단되면 v1을 지우고 이 플래그도 없앤다(INTEGRATION.md 참고).
//
// ⚠️ 캐시는 프로세스 메모리 Map이다 — Vercel 서버리스에서는 요청마다 다른
// 인스턴스에 갈 수 있어(콜드스타트 포함) 리롤이 "코스를 찾을 수 없음"으로
// 실패할 수 있다. 지금은 v1/v2 직접 비교 테스트 용도라 감내 가능한
// 한계이지만, v2를 실사용자 트래픽에 흘리기 전에는 Postgres 등 진짜
// 영속 저장소로 옮겨야 한다(INTEGRATION.md도 "메모리 LRU 또는 Redis"로
// 대안을 열어둠 — 이 프로젝트엔 Redis가 없어 우선 메모리를 택함).

import { randomUUID } from "node:crypto";
import type { Place } from "@/lib/types";
import {
  THEME_SLOTS,
  THEME_LABELS,
  findSlot,
  fetchSlotCandidates,
  sameShop,
  radiusKmFor,
  type CourseTheme,
  type TravelRadius,
  type RecommendSlot,
} from "./courseRecommend";
import { assembleRouteWithEscalation, dedupePoolsByBrand, resolveDuplicatePicks, rerollSlot, type RouteCandidate, type SlotPool } from "./courseRoute";
import {
  curateTaste,
  deterministicShortlistForSlot,
  deterministicTaste,
  expandShortlist,
  templateReason,
  type TasteCandidate,
  type TasteSlotInput,
} from "./courseTaste";

export type FinalStop = Place & { slotKey: string; slotLabel: string; hour: number; meal: boolean; reason?: string };

/** 15/30/60/120분/무제한 각각의 실제 km 반경 — radiusKmFor()를 그대로 계단으로 사용. 임의 값을 넣지 말 것(회귀 유발, 이전 리뷰에서 지적된 지점). */
const RADIUS_STEPS_KM: (number | null)[] = [15, 30, 60, 120, 0].map((m) => radiusKmFor(m as TravelRadius));

// 실측(서울/부산/강릉/오사카)에서 v1/v2 둘 다 LLM 큐레이션이 한 번도 안
// 타고 매번 결정론 폴백으로 떨어지는 게 확인됐다 — 날짜 스냅샷 없는
// "claude-haiku-4-5"는 존재하지 않는 모델 id라 매 호출이 즉시 실패(<1초)
// 하고 있었다(courseLlm.ts도 동일 문제, 같이 고침).
const MODEL = "claude-haiku-4-5-20251001";

async function callHaiku(prompt: string): Promise<string> {
  if (!process.env.LLM_API_KEY) throw new Error("no LLM_API_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.LLM_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1536,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    // v1의 curateCourseWithLlm과 같은 문제(실패가 조용히 폴백돼 로그에
    // 안 남음)를 반복하지 않도록 던지기 전에 상태코드+본문을 남긴다.
    const body = await res.text().catch(() => "");
    console.error(`[courseRecommendV2] anthropic ${res.status}: ${body}`);
    throw new Error(`anthropic ${res.status}`);
  }
  const data = (await res.json()) as { content?: { text?: string }[] };
  return data?.content?.[0]?.text ?? "";
}

function placeToTasteCandidate(p: Place): TasteCandidate {
  return { id: p.id, name: p.name, category: p.category, rating: p.rating ?? null, reviews: p.reviewCount ?? null };
}

/** A slot's full raw pool (not just its SHORTLIST_SIZE shortlist), taste-scored and sorted best-first — resolveDuplicatePicks' same-slot fallback draws from this when even the shortlist has no distinct option left. */
function scoredRawPool(raw: Place[]): RouteCandidate[] {
  return raw
    .map((p, i) => ({ p, taste: deterministicTaste(placeToTasteCandidate(p), i) }))
    .sort((a, b) => b.taste - a.taste)
    .map(({ p, taste }) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, taste, reason: templateReason(placeToTasteCandidate(p)) }));
}

// ---------------------------------------------------------------- cache

interface CachedSlot {
  slotKey: string;
  slotLabel: string;
  /** fetchSlotCandidates 원본 전체(최대 POOL_SIZE=6) — 최종 응답 조립(전체 Place 필드)과 리롤 보충(expandShortlist) 양쪽의 소스. */
  raw: Place[];
  /** LLM/결정론 취향 큐레이션 결과(최대 SHORTLIST_SIZE=3) — DP가 여기서만 고른다. 리롤로 확장되면 이 배열도 늘어난다. */
  shortlist: RouteCandidate[];
  /** 지금 이 슬롯에 실제로 확정돼 있는 후보(코스 생성 시 DP가 고른 것, 또는 이후 성공한 리롤 결과) — 이웃 슬롯을 리롤할 때 "직전/직후 스팟"으로 쓰인다. shownIds만으로는(과거에 보여줬다 리젝된 것까지 섞여 있어) 어떤 게 *지금* 확정본인지 알 수 없어 별도로 추적한다. */
  confirmed?: RouteCandidate;
}

interface CachedCourse {
  createdAt: number;
  city: string;
  theme: CourseTheme;
  order: string[]; // 슬롯 순서(THEME_SLOTS 순서 그대로) — 리롤 시 직전/직후 이웃을 찾는 데 씀
  radiusStepIndex: number; // 실제 사용된(단계 확장된) 반경 인덱스
  slots: Map<string, CachedSlot>;
  /** 지금까지 이 코스에 등장한(확정 또는 리롤로 보여준) 모든 id — 중복 재추천 방지. */
  shownIds: Set<string>;
}

const CACHE_MAX = 500;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간
const courseCache = new Map<string, CachedCourse>();

function rememberCourse(courseId: string, course: CachedCourse): void {
  if (courseCache.size >= CACHE_MAX) {
    const oldestKey = courseCache.keys().next().value;
    if (oldestKey !== undefined) courseCache.delete(oldestKey);
  }
  courseCache.set(courseId, course);
}

function getCourse(courseId: string): CachedCourse | undefined {
  const course = courseCache.get(courseId);
  if (!course) return undefined;
  if (Date.now() - course.createdAt > CACHE_TTL_MS) {
    courseCache.delete(courseId);
    return undefined;
  }
  return course;
}

function resolveIn(raw: Place[], id: string): RouteCandidate | undefined {
  const p = raw.find((x) => x.id === id);
  return p ? { id: p.id, name: p.name, lat: p.lat, lng: p.lng, taste: 0 } : undefined;
}

function toFinalStop(place: Place, slot: RecommendSlot, taste: RouteCandidate): FinalStop {
  return {
    ...place,
    slotKey: slot.key,
    slotLabel: slot.label,
    hour: slot.hour,
    meal: Boolean(slot.meal),
    ...(taste.reason ? { reason: taste.reason } : {}),
  };
}

// ---------------------------------------------------------------- generate

export interface GenerateResultV2 {
  courseId: string;
  course: FinalStop[];
  source: "llm-v2" | "deterministic-v2";
  theme: CourseTheme;
  /** 요청한 반경에서 못 찾아 단계를 넓혀 찾았을 때만 true. */
  radiusExpanded: boolean;
}

export async function generateCourseV2(
  scope: "overseas" | "domestic",
  city: string,
  theme: CourseTheme,
  requestedRadius: TravelRadius,
): Promise<GenerateResultV2 | { course: []; source: "mock"; theme: CourseTheme }> {
  const slots = THEME_SLOTS[theme];

  // 1. 후보 수집 — v1과 동일한 fetchSlotCandidates(POOL_SIZE=6까지).
  const rawPools = await Promise.all(slots.map(async (slot) => ({ slot, raw: await fetchSlotCandidates(scope, city, slot) })));
  if (rawPools.every((p) => p.raw.length === 0)) {
    return { course: [], source: "mock", theme };
  }

  const rawBySlot = new Map(rawPools.map((p) => [p.slot.key, p.raw]));
  const resolve = (slotKey: string, id: string) => resolveIn(rawBySlot.get(slotKey) ?? [], id);

  // 2. LLM 취향 큐레이션(슬롯당 상위 3, 동선은 절대 고려 안 함) — 실패 시 전체 결정론 폴백.
  const tasteInputs: TasteSlotInput[] = rawPools.map(({ slot, raw }) => ({
    slotKey: slot.key,
    slotLabel: `${slot.label} · ${String(slot.hour).padStart(2, "0")}:00`,
    candidates: raw.map(placeToTasteCandidate),
  }));
  const llmShortlists = await curateTaste(city, THEME_LABELS[theme], tasteInputs, resolve, callHaiku).catch((err) => {
    console.error("[courseRecommendV2] curateTaste threw:", err);
    return null;
  });
  const shortlists = llmShortlists ?? tasteInputs.map((s) => deterministicShortlistForSlot(s, resolve));

  // 3. 브랜드 중복 사전 제거.
  const pools: SlotPool[] = dedupePoolsByBrand(shortlists, sameShop);

  // 4. DP 조립 + 반경 단계 확장(radiusKmFor() 환산값 그대로 사용).
  const requestedStepIndex = [15, 30, 60, 120, 0].indexOf(requestedRadius);
  const result = assembleRouteWithEscalation(pools, RADIUS_STEPS_KM, requestedStepIndex === -1 ? 0 : requestedStepIndex);
  if (!result || result.picked.size === 0) {
    return { course: [], source: "mock", theme };
  }

  // 4.5. 슬롯 간 동일 장소 중복 배정 정리 — 실측(서울/부산/강릉/오사카)에서
  // "점심에 간 식당을 저녁에 또" 같은 사례가 실제로 발생해 추가한 사후
  // 검증. dedupePoolsByBrand의 "슬롯이 통째로 비면 최상위 1개는 되살리기"
  // 안전장치가 바로 이 중복을 만들 수 있는 원인이라, DP 결과를 최종
  // 확정하기 전에 한 번 더 슬롯 순서대로 훑어 정리한다.
  const finalPicked = resolveDuplicatePicks(
    slots.map((s) => s.key),
    result.picked,
    pools,
    (slotKey) => scoredRawPool(rawBySlot.get(slotKey) ?? []),
    sameShop,
  );

  // 5. 최종 응답 조립(v1과 같은 FinalStop 형태) + 리롤용 캐시 적재.
  const course: FinalStop[] = [];
  const shownIds = new Set<string>();
  const cachedSlots = new Map<string, CachedSlot>();
  for (const { slot, raw } of rawPools) {
    const picked = finalPicked.get(slot.key);
    const pool = pools.find((p) => p.slotKey === slot.key);
    cachedSlots.set(slot.key, { slotKey: slot.key, slotLabel: slot.label, raw, shortlist: pool?.candidates ?? [], confirmed: picked });
    if (!picked) continue;
    const place = raw.find((p) => p.id === picked.id);
    if (!place) continue;
    course.push(toFinalStop(place, slot, picked));
    shownIds.add(picked.id);
  }

  const courseId = randomUUID();
  rememberCourse(courseId, {
    createdAt: Date.now(),
    city,
    theme,
    order: slots.map((s) => s.key),
    radiusStepIndex: result.usedStep,
    slots: cachedSlots,
    shownIds,
  });

  return {
    courseId,
    course,
    source: llmShortlists ? "llm-v2" : "deterministic-v2",
    theme,
    radiusExpanded: result.usedStep > (requestedStepIndex === -1 ? 0 : requestedStepIndex),
  };
}

// ---------------------------------------------------------------- reroll

export interface RerollResultV2 {
  stop: FinalStop | null;
  /** "shortlist" = 캐시된 쇼트리스트에서 바로 찾음. "expanded" = 쇼트리스트가 고갈돼 같은 슬롯의 남은 raw 후보로 보충한 뒤 찾음(추가 API 호출 없음). 코스 생성 시 그 슬롯이 LLM/결정론 중 어느 쪽이었는지는 여기선 구분하지 않는다 — 로깅용 메타 이상의 의미는 없음. */
  source: "shortlist" | "expanded" | "course-not-found" | "exhausted";
}

/**
 * 한 슬롯 리롤. 캐시된 쇼트리스트에서 먼저 시도하고, 고갈됐으면
 * 같은 슬롯의 원본 raw 풀(fetchSlotCandidates가 이미 받아온 나머지
 * 후보들)로 expandShortlist() 보충 후 재시도 — 이 단계는 추가 API
 * 호출이 없다(POOL_SIZE=6개 중 처음에 안 쓰인 나머지). 그래도 없으면
 * "exhausted".
 */
export async function rerollSlotV2(courseId: string, slotKey: string): Promise<RerollResultV2> {
  const course = getCourse(courseId);
  if (!course) return { stop: null, source: "course-not-found" };

  const slot = findSlot(course.theme, slotKey);
  const cachedSlot = course.slots.get(slotKey);
  if (!slot || !cachedSlot) return { stop: null, source: "course-not-found" };

  const radiusKm = RADIUS_STEPS_KM[course.radiusStepIndex] ?? null;
  const idx = course.order.indexOf(slotKey);
  const prevKey = idx > 0 ? course.order[idx - 1] : undefined;
  const nextKey = idx < course.order.length - 1 ? course.order[idx + 1] : undefined;
  const prev = prevKey ? course.slots.get(prevKey)?.confirmed : undefined;
  const next = nextKey ? course.slots.get(nextKey)?.confirmed : undefined;

  const pool: SlotPool = { slotKey, candidates: cachedSlot.shortlist };
  let next1 = rerollSlot(pool, { prev, next, excludeIds: course.shownIds, radiusKm });
  let source: RerollResultV2["source"] = "shortlist";

  if (!next1) {
    // 쇼트리스트 고갈 — 같은 슬롯 raw 풀에서 아직 안 쓰인 나머지로 보충(추가 API 호출 없음).
    const resolve = (_sk: string, id: string) => resolveIn(cachedSlot.raw, id);
    const fresh = cachedSlot.raw.map(placeToTasteCandidate);
    const expanded = expandShortlist(pool, fresh, resolve, course.shownIds, sameShop);
    if (expanded.candidates.length > cachedSlot.shortlist.length) {
      cachedSlot.shortlist = expanded.candidates;
      next1 = rerollSlot({ slotKey, candidates: expanded.candidates }, { prev, next, excludeIds: course.shownIds, radiusKm });
      source = "expanded";
    }
  }

  if (!next1) return { stop: null, source: "exhausted" };

  const place = cachedSlot.raw.find((p) => p.id === next1!.id);
  if (!place) return { stop: null, source: "exhausted" };

  course.shownIds.add(next1.id);
  if (!next1.reason) next1.reason = templateReason(placeToTasteCandidate(place));
  cachedSlot.confirmed = next1;

  return { stop: toFinalStop(place, slot, next1), source };
}
