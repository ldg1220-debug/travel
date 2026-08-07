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
import { pool } from "@/lib/server/db";
import { styleForCategory } from "@/lib/placeStyle";
import type { Place } from "@/lib/types";
import {
  THEME_SLOTS,
  THEME_LABELS,
  fetchSlotCandidates,
  sameShop,
  radiusKmFor,
  buildDynamicSlots,
  type CourseTheme,
  type TravelRadius,
  type TravelMode,
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

/** 15/30/60/120분/무제한 각각의 실제 km 반경 — radiusKmFor()를 그대로 계단으로 사용. 임의 값을 넣지 말 것(회귀 유발, 이전 리뷰에서 지적된 지점). mode별로 속도가 달라(radiusKmFor 참고) 매 요청 계산해야 해서 모듈 상수가 아니라 함수다. */
function radiusStepsKmFor(mode: TravelMode): (number | null)[] {
  return [15, 30, 60, 120, 0].map((m) => radiusKmFor(m as TravelRadius, mode));
}

/** 시작·종료 위치 고정(DP 앵커) 시 pools 배열 맨 앞/뒤에 붙이는 합성 레이어의 슬롯 키 — 후보가 정확히 1개뿐이라 DP가 "공짜로" 그 지점을 반드시 거치게 만든다(courseRoute.ts는 이 목적을 위해 전혀 손대지 않았다: 후보가 하나뿐인 레이어는 기존 인접-레이어 페널티 로직만으로 이미 고정점 역할을 한다). dedupePoolsByBrand/resolveDuplicatePicks 둘 다 이 키들을 절대 건드리지 않는다 — 사용자가 고른 시작·종료 장소를 "중복"이라고 지우거나 바꿔치기하면 안 되므로. */
const START_ANCHOR_KEY = "__start__";
const END_ANCHOR_KEY = "__end__";

/** LLM 프롬프트에 슬롯당 넣는 후보 수 — POOL_SIZE(10)보다 작게 잡아 토큰/응답시간을 줄인다. 리롤은 POOL_SIZE 전체를 그대로 쓰므로 영향 없음. */
const LLM_CANDIDATE_LIMIT = 6;

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
      // 실측(오사카)에서 해외 장소명(영문+현지어 혼용) 때문에 응답이 중간에
      // 잘려 unparseable JSON으로 폴백하는 게 확인됨 — 여유 있게 올림.
      max_tokens: 2560,
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
//
// Postgres-backed (course_cache 테이블, schema.sql) — 원래는 프로세스 메모리
// Map이었는데, 실측(Vercel 프리뷰)에서 리롤 요청이 코스를 만든 것과 다른
// 서버리스 인스턴스로 가면(콜드스타트 포함) 매번 "코스를 찾을 수 없음"이
// 재현돼(이전 세션에서 만든 courseId로 리롤 8회 전부 실패) 옮겼다.

interface CachedSlot {
  slotKey: string;
  slotLabel: string;
  /** fetchSlotCandidates 원본 전체(최대 POOL_SIZE=10) — 최종 응답 조립(전체 Place 필드)과 리롤 보충(expandShortlist) 양쪽의 소스. */
  raw: Place[];
  /** LLM/결정론 취향 큐레이션 결과(최대 SHORTLIST_SIZE=3) — DP가 여기서만 고른다. 리롤로 확장되면 이 배열도 늘어난다. */
  shortlist: RouteCandidate[];
  /** 지금 이 슬롯에 실제로 확정돼 있는 후보(코스 생성 시 DP가 고른 것, 또는 이후 성공한 리롤 결과) — 이웃 슬롯을 리롤할 때 "직전/직후 스팟"으로 쓰인다. shownIds만으로는(과거에 보여줬다 리젝된 것까지 섞여 있어) 어떤 게 *지금* 확정본인지 알 수 없어 별도로 추적한다. */
  confirmed?: RouteCandidate;
}

/** 메모리에서 다루는 형태 — slots/slotDefs/shownIds가 Map/Set이라 나머지 코드(course.slots.get(...), course.shownIds.add(...))가 그대로 자연스럽다. */
interface CachedCourse {
  city: string;
  theme: CourseTheme;
  order: string[]; // 슬롯 순서(실제 사용된 THEME_SLOTS 또는 buildDynamicSlots 결과 순서) — 리롤 시 직전/직후 이웃을 찾는 데 씀. 앵커 키(__start__/__end__)는 절대 포함하지 않는다 — 아래 startAnchor/endAnchor가 그 역할을 대신한다.
  radiusStepIndex: number; // 실제 사용된(단계 확장된) 반경 인덱스
  mode: TravelMode; // 반경 단계를 다시 계산할 때(리롤 시) 필요 — radiusKmFor가 mode별로 다른 속도를 쓰므로 저장해둬야 한다.
  slots: Map<string, CachedSlot>;
  /** 이 코스를 만들 때 실제로 쓰인 슬롯 정의(라벨/시각/카테고리/식사여부) — 동적 슬롯(buildDynamicSlots)일 땐 THEME_SLOTS의 고정값과 다를 수 있어, 리롤 시 findSlot()으로 다시 찾지 않고 코스별로 그대로 들고 있는다. */
  slotDefs: Map<string, RecommendSlot>;
  /** 지금까지 이 코스에 등장한(확정 또는 리롤로 보여준) 모든 id — 중복 재추천 방지. */
  shownIds: Set<string>;
  /** 시작·종료 위치 고정(DP 핀) — 있으면 order[0]/order[last] 리롤 시 이웃(prev/next)으로 취급된다. 리롤 대상이 아니므로 slots 맵엔 안 넣는다. */
  startAnchor?: RouteCandidate;
  endAnchor?: RouteCandidate;
}

/** JSONB로 저장 가능한 형태 — Map/Set은 JSON.stringify로 안 살아남아 별도 직렬화가 필요하다. */
interface SerializedCachedCourse {
  city: string;
  theme: CourseTheme;
  order: string[];
  radiusStepIndex: number;
  mode: TravelMode;
  slots: Record<string, CachedSlot>;
  slotDefs: Record<string, RecommendSlot>;
  shownIds: string[];
  startAnchor?: RouteCandidate;
  endAnchor?: RouteCandidate;
}

function serializeCourse(course: CachedCourse): SerializedCachedCourse {
  return {
    city: course.city,
    theme: course.theme,
    order: course.order,
    radiusStepIndex: course.radiusStepIndex,
    mode: course.mode,
    slots: Object.fromEntries(course.slots),
    slotDefs: Object.fromEntries(course.slotDefs),
    shownIds: [...course.shownIds],
    startAnchor: course.startAnchor,
    endAnchor: course.endAnchor,
  };
}

function deserializeCourse(raw: SerializedCachedCourse): CachedCourse {
  return {
    city: raw.city,
    theme: raw.theme,
    order: raw.order,
    radiusStepIndex: raw.radiusStepIndex,
    // 이 코스 캐시 도입(v2) 이후 새로 추가된 필드라 이전에 저장된 행엔 없을
    // 수 있다 — TTL이 1시간이라 실질적으로는 거의 안 남지만, undefined로
    // radiusStepsKmFor(undefined)를 부르면 에러이므로 안전한 기본값을 둔다.
    mode: raw.mode ?? "car",
    slots: new Map(Object.entries(raw.slots)),
    slotDefs: new Map(Object.entries(raw.slotDefs ?? {})),
    shownIds: new Set(raw.shownIds),
    startAnchor: raw.startAnchor,
    endAnchor: raw.endAnchor,
  };
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

/**
 * 코스 생성 시 최초 저장은 물론, 리롤 성공 뒤 바뀐 상태(shownIds에 새 id
 * 추가, 해당 슬롯의 shortlist/confirmed 갱신)를 다시 써넣을 때도 이 함수를
 * 쓴다 — getCourse가 매번 새로 역직렬화한 객체를 돌려주므로(메모리 Map과
 * 달리 참조 공유가 안 됨), rerollSlotV2가 로컬에서 course를 mutate만 하고
 * 여기로 다시 저장하지 않으면 그 변경은 사라진다.
 */
async function rememberCourse(courseId: string, course: CachedCourse): Promise<void> {
  await pool.query(
    `insert into course_cache (id, payload) values ($1, $2)
     on conflict (id) do update set payload = excluded.payload`,
    [courseId, JSON.stringify(serializeCourse(course))],
  );
  // 별도 크론 없이(v2가 아직 실험 단계라 인프라를 더 늘리지 않으려) 쓰기
  // 경로에서 가끔(5%) 오래된 행을 청소한다 — created_at에 인덱스가 있어 싸다.
  if (Math.random() < 0.05) {
    pool.query(`delete from course_cache where created_at < now() - interval '1 hour'`).catch((err) => {
      console.error("[courseRecommendV2] cache cleanup failed:", err);
    });
  }
}

async function getCourse(courseId: string): Promise<CachedCourse | undefined> {
  const result = await pool.query<{ payload: SerializedCachedCourse; created_at: string }>(
    `select payload, created_at from course_cache where id = $1`,
    [courseId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  if (Date.now() - new Date(row.created_at).getTime() > CACHE_TTL_MS) {
    pool.query(`delete from course_cache where id = $1`, [courseId]).catch(() => {});
    return undefined;
  }
  return deserializeCourse(row.payload);
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

/** 사용자가 직접 고른 시작/종료 장소(클라이언트가 PlacesSearchInput 등으로 이미 검색·확정한 실제 Place)를 DP 앵커 후보로 변환. */
function anchorToRouteCandidate(anchor: GenerateCourseAnchor): RouteCandidate {
  return { id: anchor.id, name: anchor.name, lat: anchor.lat, lng: anchor.lng, taste: 0 };
}

/** 앵커를 코스 응답의 bookend 스톱으로 변환 — RangeSelectPlaceModal.tsx의 수동 입력 장소와 같은 패턴(styleForCategory("Place", id))으로 색/아이콘을 부여한다. */
function anchorToFinalStop(anchor: RouteCandidate, slotKey: string, label: string, hour: number): FinalStop {
  const { color, icon } = styleForCategory("Place", anchor.id);
  return {
    id: anchor.id,
    placeId: anchor.id,
    name: anchor.name,
    category: "Place",
    color,
    icon,
    lat: anchor.lat,
    lng: anchor.lng,
    slotKey,
    slotLabel: label,
    hour: Math.min(23, Math.max(0, hour)),
    meal: false,
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

export interface GenerateCourseAnchor {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface GenerateCourseOptions {
  /** 스팟 간 이동 수단 — radiusKmFor의 속도 계수를 바꾼다. 기본 "car"(기존 동작 그대로). */
  mode?: TravelMode;
  /** 자정 기준 분. 시작·종료 둘 다 있어야 buildDynamicSlots()가 켜진다 — 하나만 오면 기존 고정 THEME_SLOTS로 폴백(둘 중 하나만 있는 시간 예산은 애매해서 안전하게 무시). */
  startMinutes?: number;
  endMinutes?: number;
  /** 시작·종료 위치 고정(DP 앵커). startAnchor와 endAnchor가 좌표까지 같으면(예: "숙소로 복귀") 자연히 순환 경로가 된다 — DP 자체엔 원형/직선을 구분하는 별도 코드가 없고, 마지막 실제 슬롯 → endAnchor 간 이동 페널티가 기존 인접-레이어 로직 그대로 적용되어 복귀 동선까지 최적화에 포함된다. */
  startAnchor?: GenerateCourseAnchor;
  endAnchor?: GenerateCourseAnchor;
}

export async function generateCourseV2(
  scope: "overseas" | "domestic",
  city: string,
  theme: CourseTheme,
  requestedRadius: TravelRadius,
  options: GenerateCourseOptions = {},
): Promise<GenerateResultV2 | { course: []; source: "mock"; theme: CourseTheme }> {
  const mode: TravelMode = options.mode ?? "car";
  const radiusStepsKm = radiusStepsKmFor(mode);

  // 시작·종료 시각이 둘 다 있으면 시간 예산 기반 동적 슬롯, 아니면(기본)
  // 기존 고정 THEME_SLOTS — buildDynamicSlots가 예산이 비정상적으로 짧아
  // 빈 배열을 돌려주는 경우도 마찬가지로 THEME_SLOTS 폴백.
  const dynamicSlots =
    options.startMinutes != null && options.endMinutes != null ? buildDynamicSlots(theme, options.startMinutes, options.endMinutes) : null;
  const slots = dynamicSlots && dynamicSlots.length > 0 ? dynamicSlots : THEME_SLOTS[theme];

  // 1. 후보 수집 — v1과 동일한 fetchSlotCandidates(POOL_SIZE=6까지).
  const rawPools = await Promise.all(slots.map(async (slot) => ({ slot, raw: await fetchSlotCandidates(scope, city, slot) })));
  if (rawPools.every((p) => p.raw.length === 0)) {
    return { course: [], source: "mock", theme };
  }

  const rawBySlot = new Map(rawPools.map((p) => [p.slot.key, p.raw]));
  const resolve = (slotKey: string, id: string) => resolveIn(rawBySlot.get(slotKey) ?? [], id);

  // 2. LLM 취향 큐레이션(슬롯당 상위 3, 동선은 절대 고려 안 함) — 실패 시 전체 결정론 폴백.
  // 프롬프트엔 POOL_SIZE(10)개 전부가 아니라 자체 점수 상위 LLM_CANDIDATE_
  // LIMIT(6)개만 넣는다 — 실측에서 응답시간이 8~14초로 확인됐고, POOL_SIZE를
  // 6→10으로 올린 만큼(리롤 여유 확보 목적) 프롬프트도 같이 커져 있었다.
  // 나머지(리롤용 예비 후보)는 rawBySlot에 그대로 남아있어 리롤/
  // resolveDuplicatePicks 쪽 풍부함에는 영향 없다 — LLM 토큰 비용/응답
  // 시간만 줄이는 변경.
  const tasteInputs: TasteSlotInput[] = rawPools.map(({ slot, raw }) => ({
    slotKey: slot.key,
    slotLabel: `${slot.label} · ${String(slot.hour).padStart(2, "0")}:00`,
    candidates: raw
      .map((p, i) => ({ c: placeToTasteCandidate(p), taste: deterministicTaste(placeToTasteCandidate(p), i) }))
      .sort((a, b) => b.taste - a.taste)
      .slice(0, LLM_CANDIDATE_LIMIT)
      .map(({ c }) => c),
  }));
  const llmShortlists = await curateTaste(city, THEME_LABELS[theme], tasteInputs, resolve, callHaiku).catch((err) => {
    console.error("[courseRecommendV2] curateTaste threw:", err);
    return null;
  });
  const shortlists = llmShortlists ?? tasteInputs.map((s) => deterministicShortlistForSlot(s, resolve));

  // 3. 브랜드 중복 사전 제거 — 앵커는 여기 절대 안 들어간다(브랜드 중복
  // 판정 대상이 아니다. 사용자가 고른 시작·종료 장소가 어느 슬롯 후보와
  // 이름이 겹친다고 해서 지워지거나 슬롯 쪽이 밀려나면 안 된다).
  const pools: SlotPool[] = dedupePoolsByBrand(shortlists, sameShop);

  // 3.5. 시작·종료 위치 고정 — pools 맨 앞/뒤에 후보 1개짜리 합성 레이어를
  // 붙인다. courseRoute.ts의 DP는 이 목적을 위해 전혀 수정하지 않았다:
  // 후보가 하나뿐인 레이어는 기존 인접-레이어 이동 페널티 로직만으로 이미
  // "반드시 이 지점을 거침" 제약이 된다(자세한 설계 근거는 START_ANCHOR_KEY
  // 주석 참고).
  const startAnchor = options.startAnchor ? anchorToRouteCandidate(options.startAnchor) : undefined;
  const endAnchor = options.endAnchor ? anchorToRouteCandidate(options.endAnchor) : undefined;
  const dpPools: SlotPool[] = [
    ...(startAnchor ? [{ slotKey: START_ANCHOR_KEY, candidates: [startAnchor] }] : []),
    ...pools,
    ...(endAnchor ? [{ slotKey: END_ANCHOR_KEY, candidates: [endAnchor] }] : []),
  ];

  // 4. DP 조립 + 반경 단계 확장(radiusKmFor() 환산값 그대로 사용).
  const requestedStepIndex = [15, 30, 60, 120, 0].indexOf(requestedRadius);
  const result = assembleRouteWithEscalation(dpPools, radiusStepsKm, requestedStepIndex === -1 ? 0 : requestedStepIndex);
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
  const slotDefs = new Map<string, RecommendSlot>();

  // 시작 위치는 실제 슬롯보다 먼저 나오는 bookend — hour는 사용자가 준
  // 시작 시각(있으면)을, 없으면 첫 실제 스톱 시각을 그대로 써 시간순
  // 표시가 어색해지지 않게 한다.
  if (startAnchor) {
    const hour = options.startMinutes != null ? Math.round(options.startMinutes / 60) : slots[0]?.hour ?? 9;
    course.push(anchorToFinalStop(startAnchor, START_ANCHOR_KEY, "출발지", hour));
    shownIds.add(startAnchor.id);
  }

  for (const { slot, raw } of rawPools) {
    const picked = finalPicked.get(slot.key);
    // "pool" 이름은 위쪽에서 이미 Postgres pool import로 쓰고 있어(파일
    // 최상단 import { pool } from "@/lib/server/db") 겹치지 않게 slotPool로.
    const slotPool = pools.find((p) => p.slotKey === slot.key);
    cachedSlots.set(slot.key, { slotKey: slot.key, slotLabel: slot.label, raw, shortlist: slotPool?.candidates ?? [], confirmed: picked });
    slotDefs.set(slot.key, slot);
    if (!picked) continue;
    const place = raw.find((p) => p.id === picked.id);
    if (!place) continue;
    course.push(toFinalStop(place, slot, picked));
    shownIds.add(picked.id);
  }

  if (endAnchor) {
    const hour = options.endMinutes != null ? Math.round(options.endMinutes / 60) : slots[slots.length - 1]?.hour ?? 21;
    course.push(anchorToFinalStop(endAnchor, END_ANCHOR_KEY, "도착지", hour));
    shownIds.add(endAnchor.id);
  }

  const courseId = randomUUID();
  await rememberCourse(courseId, {
    city,
    theme,
    order: slots.map((s) => s.key),
    radiusStepIndex: result.usedStep,
    mode,
    slots: cachedSlots,
    slotDefs,
    shownIds,
    startAnchor,
    endAnchor,
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
  const course = await getCourse(courseId);
  if (!course) return { stop: null, source: "course-not-found" };

  // findSlot(THEME_SLOTS 고정값)이 아니라 이 코스 생성 시 실제로 쓰인
  // slotDefs에서 찾는다 — 동적 슬롯(buildDynamicSlots)이었다면 hour 등이
  // THEME_SLOTS의 고정값과 다를 수 있어, 코스별로 저장해둔 정의를 그대로
  // 써야 리롤 결과의 시각 표시가 원래 코스와 어긋나지 않는다.
  const slot = course.slotDefs.get(slotKey);
  const cachedSlot = course.slots.get(slotKey);
  if (!slot || !cachedSlot) return { stop: null, source: "course-not-found" };

  const radiusKm = radiusStepsKmFor(course.mode)[course.radiusStepIndex] ?? null;
  const idx = course.order.indexOf(slotKey);
  const prevKey = idx > 0 ? course.order[idx - 1] : undefined;
  const nextKey = idx < course.order.length - 1 ? course.order[idx + 1] : undefined;
  // order엔 앵커 키가 없다(설계상 항상 제외) — 첫/마지막 실제 슬롯은 이웃
  // 슬롯이 없는 대신 시작·종료 위치 고정이 있으면 그게 이웃 역할을 한다.
  const prev = prevKey ? course.slots.get(prevKey)?.confirmed : course.startAnchor;
  const next = nextKey ? course.slots.get(nextKey)?.confirmed : course.endAnchor;

  const slotPool: SlotPool = { slotKey, candidates: cachedSlot.shortlist };
  let next1 = rerollSlot(slotPool, { prev, next, excludeIds: course.shownIds, radiusKm });
  let source: RerollResultV2["source"] = "shortlist";

  if (!next1) {
    // 쇼트리스트 고갈 — 같은 슬롯 raw 풀에서 아직 안 쓰인 나머지로 보충(추가 API 호출 없음).
    const resolve = (_sk: string, id: string) => resolveIn(cachedSlot.raw, id);
    const fresh = cachedSlot.raw.map(placeToTasteCandidate);
    const expanded = expandShortlist(slotPool, fresh, resolve, course.shownIds, sameShop);
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

  // getCourse()는 매번 새로 역직렬화한 사본을 주므로(메모리 Map과 달리
  // 참조 공유가 안 됨), 위에서 course를 mutate만 하고 여기서 다시 저장하지
  // 않으면 다음 리롤 요청은 이번 변경을 못 본 채 시작한다.
  await rememberCourse(courseId, course);

  return { stop: toFinalStop(place, slot, next1), source };
}
