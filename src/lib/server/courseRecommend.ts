import { colorForId } from "@/lib/placeStyle";
import { pool } from "@/lib/server/db";
import type { Place } from "@/lib/types";

/**
 * Shared building blocks for "AI 추천 동선" — the day-slot definitions,
 * live Google/Kakao candidate search, and the deterministic ranker. Used
 * by both the full-day assembly route (course/recommend) and the
 * single-slot reroll route (course/recommend/reroll) so a "다른 곳 추천"
 * on one stop reuses exactly the same search/ranking as the initial build.
 */

export interface RecommendSlot {
  key: string;
  label: string;
  keyword: string;
  hour: number;
  category?: "attraction" | "restaurant" | "lodging" | "cafe";
  /** Meal slots get a "점심"/"저녁" style marker in the course. */
  meal?: boolean;
}

export type CourseTheme = "balanced" | "foodie" | "healing" | "culture" | "active";

/**
 * User-selectable cap on travel between consecutive stops, in minutes.
 * 0 means unlimited (no cap — the old, always-on behavior). Beta feedback:
 * a hardcoded ~30-min feel was too tight for rural/overseas legs where
 * real attractions can legitimately be much farther apart, so this is a
 * pickable option instead of a fixed constant.
 */
export type TravelRadius = 0 | 15 | 30 | 60 | 120;
export const TRAVEL_RADIUS_OPTIONS: { minutes: TravelRadius; label: string }[] = [
  { minutes: 15, label: "15분" },
  { minutes: 30, label: "30분" },
  { minutes: 60, label: "1시간" },
  { minutes: 120, label: "2시간" },
  { minutes: 0, label: "제한없음" },
];
export function parseTravelRadius(raw: string | null): TravelRadius {
  // `raw` missing/empty must fall through to the 60-minute default, not
  // "제한없음" — but `Number(null)` and `Number("")` are both `0`, which is
  // also a legitimate TravelRadius value, so an explicit presence check is
  // required (a plain `.some(...)` match would silently accept the coerced
  // 0 as if the caller had asked for "제한없음").
  if (raw == null || raw === "") return 60;
  const n = Number(raw);
  return TRAVEL_RADIUS_OPTIONS.some((o) => o.minutes === n) ? (n as TravelRadius) : 60;
}

/**
 * 이동 수단 — 반경(radiusKmFor)이 가정하는 이동 속도를 결정한다. 기존엔
 * "15분 = 6.25km"처럼 항상 자동차 속도(25km/h)를 가정했는데, 실제로는
 * 사용자가 도보/대중교통으로 다닐 수도 있어 "15분"이 의미하는 실제 거리가
 * 크게 달라진다(도보 15분 ≈ 1.2km, 자동차 15분 ≈ 6.25km) — 그대로 두면
 * 도보 여행자에게 "15분 반경"이 실제론 도보로 1시간 넘게 걸리는 곳까지
 * 포함되는 식으로 라벨과 실제 소요시간이 어긋난다.
 */
export type TravelMode = "walk" | "transit" | "car";
export const TRAVEL_MODE_OPTIONS: { mode: TravelMode; label: string }[] = [
  { mode: "walk", label: "도보" },
  { mode: "transit", label: "대중교통" },
  { mode: "car", label: "자동차" },
];
export function parseTravelMode(raw: string | null): TravelMode {
  return TRAVEL_MODE_OPTIONS.some((o) => o.mode === raw) ? (raw as TravelMode) : "car";
}

// Straight-line (Haversine) distance is always shorter than the real route,
// so each speed is a conservative (slow) blended estimate rather than a
// theoretical max — keeps the cap meaningful rather than technically-true-
// but-useless. Google Directions API 연동은 코스 조립 한 번에 스팟 수만큼
// 경로 요청이 쌓여 방금 줄인 Places 비용을 상쇄할 수 있어 지금은 미룬다
// (계수 기반 근사로 충분히 실용적) — INTEGRATION.md 참고.
const MODE_SPEED_KMH: Record<TravelMode, number> = {
  walk: 4.8, // 성인 평균 도보 속도(4~5km/h)에서 신호 대기 등을 감안해 살짝 보수적으로.
  transit: 18, // 정차·환승 대기까지 뭉뚱그린 체감 속도 — 실제 주행 구간보다 낮게.
  car: 25, // 기존 AVG_SPEED_KMH 그대로 — 도심 주행/택시 체감 속도.
};

/** Minutes → km cap, or null for "제한없음"/no anchor yet. `mode` defaults to "car" so every existing caller (반경 선택지가 있던 시절부터의 호출부) keeps its old behavior unchanged. */
export function radiusKmFor(minutes: TravelRadius, mode: TravelMode = "car"): number | null {
  return minutes ? (minutes / 60) * MODE_SPEED_KMH[mode] : null;
}

/** "HH:MM" → minutes since midnight, or null if missing/malformed. Used for the optional time-budget-driven dynamic slot schedule (buildDynamicSlots). */
export function parseTimeToMinutes(raw: string | null): number | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export const THEME_LABELS: Record<CourseTheme, string> = {
  balanced: "밸런스 (관광+맛집+야경 골고루)",
  foodie: "미식 위주",
  healing: "힐링·감성",
  culture: "역사·문화",
  active: "액티비티",
};

// 테마별 하루 골격. 슬롯 키워드가 도시명 뒤에 붙어 라이브 검색어가 된다
// ("강릉 감성 카페"). 어느 테마든 점심·저녁 식사 슬롯은 유지해 실용성을 지킴.
export const THEME_SLOTS: Record<CourseTheme, RecommendSlot[]> = {
  balanced: [
    { key: "am-sight", label: "오전 명소", keyword: "관광지", hour: 10, category: "attraction" },
    // "시장 거리"는 부분 문자열 매칭에서 "장거리"(long-distance)와 충돌해
    // 택시회사 같은 엉뚱한 업체가 섞여 들어온 적이 있어 "전통시장"으로 좁혔다.
    { key: "market", label: "시장·거리", keyword: "전통시장", hour: 11, category: "attraction" },
    { key: "lunch", label: "점심", keyword: "맛집", hour: 12, category: "restaurant", meal: true },
    // "가볼만한곳"도 결국 am-sight와 같은 관광명소 카테고리(AT4/tourist_
    // attraction) 검색이라 실측에서 같은 도시의 대표 명소(예: 북한산둘레길)
    // 가 오전·오후 명소 양쪽에 다 뽑혀 나오는 걸 확인했다 — "포토존"으로
    // 검색 의도 자체를 갈라 원본 후보 풀이 덜 겹치게 했다(그래도 완전히
    // 안 겹친다는 보장은 없어, 남는 중복은 courseRoute.ts의
    // resolveDuplicatePicks가 최종 방어선으로 잡는다).
    { key: "pm-sight", label: "오후 명소", keyword: "포토존", hour: 14, category: "attraction" },
    { key: "cafe", label: "카페", keyword: "카페", hour: 16, category: "cafe" },
    // 마찬가지로 "야경" 단독 키워드는 실측(v2 비교테스트)에서 "다이닝야경
    // ○○점" 같은 상호명에 그대로 걸려 식당이 야경 명소로 잘못 들어온 사례가
    // 나와, culture/active 테마가 이미 쓰던 "야경 명소"로 통일했다.
    { key: "night", label: "야경 명소", keyword: "야경 명소", hour: 19, category: "attraction" },
    // lunch와 똑같이 "맛집"만 검색하면 원본 후보 풀이 사실상 동일해서(같은
    // 도시+같은 키워드 검색) 점심에 갔던 식당이 저녁에도 또 뽑히는 사례가
    // 실측에서 나왔다 — "저녁"을 붙여 검색어 자체를 갈랐다.
    { key: "dinner", label: "저녁", keyword: "저녁 맛집", hour: 20, category: "restaurant", meal: true },
  ],
  foodie: [
    { key: "brunch", label: "브런치", keyword: "브런치 카페", hour: 10, category: "restaurant", meal: true },
    { key: "market", label: "먹거리 시장", keyword: "전통시장 먹거리", hour: 11, category: "attraction" },
    { key: "lunch", label: "점심 맛집", keyword: "맛집", hour: 13, category: "restaurant", meal: true },
    { key: "dessert", label: "디저트 카페", keyword: "디저트 카페", hour: 15, category: "cafe" },
    { key: "pm-sight", label: "오후 명소", keyword: "가볼만한곳", hour: 16, category: "attraction" },
    // balanced 테마와 같은 이유 — lunch와 같은 "맛집" 검색이라 겹쳤다.
    { key: "dinner", label: "저녁 맛집", keyword: "저녁 맛집", hour: 19, category: "restaurant", meal: true },
    { key: "bar", label: "야식·술집", keyword: "술집 포차", hour: 21, category: "restaurant" },
  ],
  healing: [
    { key: "cafe-am", label: "감성 카페", keyword: "감성 카페", hour: 10, category: "cafe" },
    { key: "park", label: "공원 산책", keyword: "공원 산책", hour: 11, category: "attraction" },
    { key: "lunch", label: "점심", keyword: "브런치 맛집", hour: 13, category: "restaurant", meal: true },
    { key: "view", label: "전망 명소", keyword: "전망 좋은 곳", hour: 15, category: "attraction" },
    { key: "cafe-pm", label: "분위기 카페", keyword: "분위기 좋은 카페", hour: 16, category: "cafe" },
    { key: "sunset", label: "노을 명소", keyword: "노을 명소", hour: 18, category: "attraction" },
    { key: "dinner", label: "저녁", keyword: "조용한 맛집", hour: 19, category: "restaurant", meal: true },
  ],
  culture: [
    { key: "palace", label: "고궁·유적", keyword: "고궁 유적", hour: 10, category: "attraction" },
    { key: "museum", label: "박물관·미술관", keyword: "박물관 미술관", hour: 11, category: "attraction" },
    { key: "lunch", label: "점심", keyword: "맛집", hour: 13, category: "restaurant", meal: true },
    { key: "oldtown", label: "근대·한옥거리", keyword: "근대거리 한옥마을", hour: 15, category: "attraction" },
    { key: "gallery", label: "갤러리·전시", keyword: "갤러리 전시", hour: 16, category: "attraction" },
    { key: "night", label: "야경 명소", keyword: "야경 명소", hour: 19, category: "attraction" },
    { key: "dinner", label: "저녁", keyword: "전통 맛집", hour: 20, category: "restaurant", meal: true },
  ],
  active: [
    { key: "activity", label: "액티비티", keyword: "액티비티 체험", hour: 10, category: "attraction" },
    { key: "landmark", label: "랜드마크·전망대", keyword: "랜드마크 전망대", hour: 11, category: "attraction" },
    { key: "lunch", label: "점심", keyword: "맛집", hour: 13, category: "restaurant", meal: true },
    { key: "outdoor", label: "야외 액티비티", keyword: "야외 액티비티", hour: 15, category: "attraction" },
    { key: "market", label: "거리·쇼핑", keyword: "거리 쇼핑", hour: 17, category: "attraction" },
    { key: "night", label: "야경 명소", keyword: "야경 명소", hour: 19, category: "attraction" },
    // balanced/foodie와 같은 이유.
    { key: "dinner", label: "저녁", keyword: "저녁 맛집", hour: 20, category: "restaurant", meal: true },
  ],
};

export function parseTheme(raw: string | null): CourseTheme {
  return raw && raw in THEME_SLOTS ? (raw as CourseTheme) : "balanced";
}

// ── 시간 예산 기반 동적 슬롯 ──────────────────────────────────────────
//
// 위 THEME_SLOTS는 고정 7슬롯·고정 hour(오전 10시~밤 9시대)를 가정한다 —
// "오후 2시에 김포 도착, 저녁엔 홍대 숙소"처럼 실제 가용 시간이 짧거나
// 늦게 시작하는 경우엔 안 맞는다(도착 전 시간대 슬롯이 그대로 끼어들거나,
// 밤늦게까지 슬롯이 이어짐). 그렇다고 THEME_SLOTS 자체를 바꾸면 시간 입력
// 없이 쓰는 기존(v1 포함) 기본 흐름까지 건드리게 되므로, 별도의 "템플릿"
// (고정 hour 대신 durationMinutes)을 두고 시작·종료 시각이 둘 다 주어졌을
// 때만 buildDynamicSlots()가 이를 실제 슬롯으로 편성한다. 시간 미입력 시
// (둘 중 하나라도 없음) 기존 THEME_SLOTS가 그대로 기본값이다.
interface SlotTemplate {
  key: string;
  label: string;
  keyword: string;
  category?: RecommendSlot["category"];
  /** 식사 슬롯이면 어느 끼니인지 — MEAL_WINDOWS와 대조해 예산에 그 끼니 시간대가 아예 안 걸치면 슬롯 자체를 뺀다(예: 15시~18시 예산엔 점심 슬롯이 없다). */
  mealWindow?: "lunch" | "dinner";
  /** 이 슬롯에 배정할 대략적인 체류 시간(분) — 슬롯들을 예산 안에 비례 배분하는 가중치로도 쓰인다. */
  durationMinutes: number;
}

const MEAL_WINDOWS: Record<"lunch" | "dinner", [number, number]> = {
  lunch: [11 * 60, 14 * 60 + 30],
  dinner: [17 * 60 + 30, 20 * 60 + 30],
};

function overlaps(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

// THEME_SLOTS와 같은 키/라벨/키워드/카테고리 — hour 대신 durationMinutes,
// meal:boolean 대신 mealWindow로 바뀐 것만 다르다(위 주석 참고).
const THEME_SLOT_TEMPLATES: Record<CourseTheme, SlotTemplate[]> = {
  balanced: [
    { key: "am-sight", label: "오전 명소", keyword: "관광지", category: "attraction", durationMinutes: 90 },
    { key: "market", label: "시장·거리", keyword: "전통시장", category: "attraction", durationMinutes: 60 },
    { key: "lunch", label: "점심", keyword: "맛집", category: "restaurant", mealWindow: "lunch", durationMinutes: 75 },
    { key: "pm-sight", label: "오후 명소", keyword: "포토존", category: "attraction", durationMinutes: 90 },
    { key: "cafe", label: "카페", keyword: "카페", category: "cafe", durationMinutes: 60 },
    { key: "night", label: "야경 명소", keyword: "야경 명소", category: "attraction", durationMinutes: 60 },
    { key: "dinner", label: "저녁", keyword: "저녁 맛집", category: "restaurant", mealWindow: "dinner", durationMinutes: 90 },
  ],
  foodie: [
    { key: "brunch", label: "브런치", keyword: "브런치 카페", category: "restaurant", mealWindow: "lunch", durationMinutes: 75 },
    { key: "market", label: "먹거리 시장", keyword: "전통시장 먹거리", category: "attraction", durationMinutes: 60 },
    { key: "lunch", label: "점심 맛집", keyword: "맛집", category: "restaurant", mealWindow: "lunch", durationMinutes: 75 },
    { key: "dessert", label: "디저트 카페", keyword: "디저트 카페", category: "cafe", durationMinutes: 60 },
    { key: "pm-sight", label: "오후 명소", keyword: "가볼만한곳", category: "attraction", durationMinutes: 75 },
    { key: "dinner", label: "저녁 맛집", keyword: "저녁 맛집", category: "restaurant", mealWindow: "dinner", durationMinutes: 90 },
    { key: "bar", label: "야식·술집", keyword: "술집 포차", category: "restaurant", durationMinutes: 75 },
  ],
  healing: [
    { key: "cafe-am", label: "감성 카페", keyword: "감성 카페", category: "cafe", durationMinutes: 60 },
    { key: "park", label: "공원 산책", keyword: "공원 산책", category: "attraction", durationMinutes: 90 },
    { key: "lunch", label: "점심", keyword: "브런치 맛집", category: "restaurant", mealWindow: "lunch", durationMinutes: 75 },
    { key: "view", label: "전망 명소", keyword: "전망 좋은 곳", category: "attraction", durationMinutes: 75 },
    { key: "cafe-pm", label: "분위기 카페", keyword: "분위기 좋은 카페", category: "cafe", durationMinutes: 60 },
    { key: "sunset", label: "노을 명소", keyword: "노을 명소", category: "attraction", durationMinutes: 60 },
    { key: "dinner", label: "저녁", keyword: "조용한 맛집", category: "restaurant", mealWindow: "dinner", durationMinutes: 90 },
  ],
  culture: [
    { key: "palace", label: "고궁·유적", keyword: "고궁 유적", category: "attraction", durationMinutes: 90 },
    { key: "museum", label: "박물관·미술관", keyword: "박물관 미술관", category: "attraction", durationMinutes: 90 },
    { key: "lunch", label: "점심", keyword: "맛집", category: "restaurant", mealWindow: "lunch", durationMinutes: 75 },
    { key: "oldtown", label: "근대·한옥거리", keyword: "근대거리 한옥마을", category: "attraction", durationMinutes: 90 },
    { key: "gallery", label: "갤러리·전시", keyword: "갤러리 전시", category: "attraction", durationMinutes: 75 },
    { key: "night", label: "야경 명소", keyword: "야경 명소", category: "attraction", durationMinutes: 60 },
    { key: "dinner", label: "저녁", keyword: "전통 맛집", category: "restaurant", mealWindow: "dinner", durationMinutes: 90 },
  ],
  active: [
    { key: "activity", label: "액티비티", keyword: "액티비티 체험", category: "attraction", durationMinutes: 120 },
    { key: "landmark", label: "랜드마크·전망대", keyword: "랜드마크 전망대", category: "attraction", durationMinutes: 75 },
    { key: "lunch", label: "점심", keyword: "맛집", category: "restaurant", mealWindow: "lunch", durationMinutes: 75 },
    { key: "outdoor", label: "야외 액티비티", keyword: "야외 액티비티", category: "attraction", durationMinutes: 120 },
    { key: "market", label: "거리·쇼핑", keyword: "거리 쇼핑", category: "attraction", durationMinutes: 60 },
    { key: "night", label: "야경 명소", keyword: "야경 명소", category: "attraction", durationMinutes: 60 },
    { key: "dinner", label: "저녁", keyword: "저녁 맛집", category: "restaurant", mealWindow: "dinner", durationMinutes: 90 },
  ],
};

/**
 * 시작·종료 시각(분 단위, 자정 기준) 예산에 맞춰 그 테마의 슬롯을 편성한다.
 * 각 템플릿의 durationMinutes 비율대로 예산을 나눠 배정 시각을 정하고,
 * 식사 슬롯은 그 끼니 시간대(MEAL_WINDOWS)와 예산이 아예 안 겹치면 통째로
 * 빼며, 겹치면 배정 시각을 그 창 안으로 당기거나 미룬다(정오에 "저녁"이
 * 뜨는 것 같은 일을 막기 위함) — 슬롯 순서(=DP 레이어 순서) 자체는 항상
 * 템플릿 원래 순서를 그대로 따른다. 예산이 비정상적으로 짧아 슬롯이 하나도
 * 안 남으면 빈 배열을 돌려주고, 호출부(courseRecommendV2.ts)가 기존
 * THEME_SLOTS로 폴백한다.
 */
export function buildDynamicSlots(theme: CourseTheme, startMinutes: number, endMinutes: number): RecommendSlot[] {
  if (endMinutes <= startMinutes) return [];
  const budget: [number, number] = [startMinutes, endMinutes];
  const templates = THEME_SLOT_TEMPLATES[theme].filter((t) => !t.mealWindow || overlaps(MEAL_WINDOWS[t.mealWindow], budget));
  if (templates.length === 0) return [];

  const totalDuration = templates.reduce((sum, t) => sum + t.durationMinutes, 0);
  const totalBudget = endMinutes - startMinutes;
  const scale = totalDuration > 0 ? totalBudget / totalDuration : 1;

  let cursor = startMinutes;
  return templates.map((t) => {
    let atMinutes = cursor;
    if (t.mealWindow) {
      const [wStart, wEnd] = MEAL_WINDOWS[t.mealWindow];
      atMinutes = Math.min(Math.max(cursor, wStart), wEnd);
    }
    cursor += t.durationMinutes * scale;
    return {
      key: t.key,
      label: t.label,
      keyword: t.keyword,
      category: t.category,
      meal: Boolean(t.mealWindow),
      // hour는 정수 표시 라벨("14:00")로만 쓰이고 DP 레이어 순서엔 관여하지
      // 않는다(courseRecommendV2.ts가 배열 순서 그대로 슬롯을 조립) —
      // 반올림으로 여러 슬롯이 같은 시(hour)에 몰려도 동작엔 영향 없다.
      hour: Math.min(23, Math.max(0, Math.round(atMinutes / 60))),
    };
  });
}

export function findSlot(theme: CourseTheme, slotKey: string): RecommendSlot | undefined {
  return THEME_SLOTS[theme].find((s) => s.key === slotKey);
}

const CATEGORY_TYPE: Record<string, string> = {
  attraction: "tourist_attraction",
  restaurant: "restaurant",
  lodging: "lodging",
  cafe: "cafe",
};
const CATEGORY_LABEL: Record<string, string> = { attraction: "관광명소", restaurant: "맛집", lodging: "숙소", cafe: "카페" };

// Kakao Local의 category_group_code — 슬롯을 이 코드로 제한해서 검색하면
// "부산장거리택시"(택시회사)가 "시장 거리" 키워드에 텍스트로 걸려 들어오는
// 것처럼, 카테고리와 무관한 업체가 섞이는 걸 막을 수 있다. AT4=관광명소,
// FD6=음식점, CE7=카페, AD5=숙박.
const KAKAO_CATEGORY_CODE: Record<string, string> = {
  attraction: "AT4",
  restaurant: "FD6",
  cafe: "CE7",
  lodging: "AD5",
};

// googleTop()/kakaoTop() below already request 8~10 results per call (same
// single billed request either way — Places New pricing is per-request by
// field tier, not per result count) but this used to slice them down to 6,
// silently discarding 2-4 already-paid-for candidates. Raised to 10 (== the
// larger of the two providers' own request sizes) — this is v2's main lever
// for surviving several reroll attempts on one slot without a real second
// API page (see courseRecommendV2.ts's expandShortlist usage), confirmed by
// live testing to run out too fast at 6.
export const POOL_SIZE = 10;

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  photos?: { name: string }[];
  googleMapsUri?: string;
}

/** rating weighted by log(review count) — favors well-reviewed AND well-rated places over a 5.0 with 3 reviews. */
function score(rating?: number, reviews?: number): number {
  if (rating == null) return 0;
  return rating * Math.log10((reviews ?? 0) + 10);
}

/** Haversine distance in km. */
function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Popularity minus a travel-distance penalty from a reference point — so
 * the course flows through the city instead of zig-zagging (a slightly
 * lower-rated café 500m away beats a top-rated one across town). ~0.35점 per
 * km, capped so a genuinely famous far-away spot can still win.
 */
export function proximityScore(rating: number | undefined, reviews: number | undefined, lat: number, lng: number, anchor: { lat: number; lng: number } | null): number {
  const base = score(rating, reviews);
  if (!anchor || !lat || !lng) return base;
  return base - Math.min(distKm(anchor.lat, anchor.lng, lat, lng) * 0.35, 4);
}

/** Same-shop duplicate guard: normalized-name prefix match (우오신/우오신 우메다점) so the course doesn't book the same brand twice. */
function normName(s: string): string {
  return s.toLowerCase().replace(/[（(【「][^）)】」]*[）)】」]/g, "").replace(/[\s·・,，.\-–—!！?？'"|｜/]/g, "");
}
export function sameShop(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  return na.startsWith(nb) || nb.startsWith(na);
}

async function googleTop(query: string, apiKey: string, includedType?: string): Promise<GooglePlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryType,places.photos,places.googleMapsUri",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 10, languageCode: "ko", ...(includedType ? { includedType } : {}) }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: GooglePlace[] };
  return data.places ?? [];
}

interface KakaoDoc {
  id: string;
  place_name: string;
  category_group_name?: string;
  road_address_name?: string;
  address_name?: string;
  x: string;
  y: string;
}
async function kakaoTop(query: string, apiKey: string, categoryGroupCode?: string): Promise<KakaoDoc[]> {
  const params = new URLSearchParams({ query, size: "10" });
  if (categoryGroupCode) params.set("category_group_code", categoryGroupCode);
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params.toString()}`, {
    cache: "no-store",
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { documents?: KakaoDoc[] };
  return data.documents ?? [];
}

function googleToPlace(p: GooglePlace, fallbackCategory: string): Place {
  return {
    id: p.id,
    placeId: p.id,
    name: p.displayName?.text ?? "이름 미확인",
    category: p.primaryType ?? fallbackCategory,
    color: colorForId(p.id),
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    rating: p.rating,
    reviewCount: p.userRatingCount,
    address: p.formattedAddress,
    photoName: p.photos?.[0]?.name,
    googleMapsUri: p.googleMapsUri,
    icon: "pin",
  };
}

function kakaoToPlace(d: KakaoDoc, fallbackCategory: string): Place {
  return {
    id: d.id,
    placeId: d.id,
    name: d.place_name,
    category: d.category_group_name?.split(" > ").pop() || fallbackCategory,
    color: colorForId(d.id),
    lat: Number(d.y),
    lng: Number(d.x),
    address: d.road_address_name || d.address_name,
    icon: "pin",
  };
}

// 도시×슬롯 후보 검색 결과 캐시(place_candidate_cache, schema.sql) — 실측
// 응답시간(8~14초)의 상당 부분이 이 라이브 검색이었고, 인기 도시는 여러
// 사용자가 반복 요청하므로 캐시 히트가 그대로 지연시간과 Places API
// 비용(요청 1건당 과금) 양쪽을 줄인다. 평점·순위 같은 신호는 하루이틀
// 사이에 크게 안 바뀌므로 TTL을 넉넉히(7일) 잡았다.
const CANDIDATE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function candidateCacheKey(scope: "overseas" | "domestic", city: string, slot: RecommendSlot): string {
  return `${scope}:${city.trim().toLowerCase()}:${slot.keyword}:${slot.category ?? ""}`;
}

async function readCandidateCache(key: string): Promise<Place[] | null> {
  try {
    const cutoff = new Date(Date.now() - CANDIDATE_CACHE_TTL_MS);
    const result = await pool.query<{ payload: Place[] }>(`select payload from place_candidate_cache where cache_key = $1 and created_at > $2`, [
      key,
      cutoff,
    ]);
    return result.rows[0]?.payload ?? null;
  } catch (err) {
    // 캐시는 어디까지나 최적화다 — 읽기가 실패해도 그냥 라이브 검색으로
    // 넘어가면 되지, 코스 생성 자체를 막을 이유는 아니다.
    console.error("[courseRecommend] candidate cache read failed:", err);
    return null;
  }
}

async function writeCandidateCache(key: string, places: Place[]): Promise<void> {
  try {
    await pool.query(
      `insert into place_candidate_cache (cache_key, payload) values ($1, $2)
       on conflict (cache_key) do update set payload = excluded.payload, created_at = now()`,
      [key, JSON.stringify(places)],
    );
    // 별도 크론 없이 쓰기 경로에서 가끔(5%) 오래된 행을 청소 — course_cache와 같은 패턴.
    if (Math.random() < 0.05) {
      pool.query(`delete from place_candidate_cache where created_at < now() - interval '30 days'`).catch((err) => {
        console.error("[courseRecommend] candidate cache cleanup failed:", err);
      });
    }
  } catch (err) {
    console.error("[courseRecommend] candidate cache write failed:", err);
  }
}

/**
 * 실제 장소 API 결과인지 최소한의 구조 검증 — id/name이 비어있거나
 * 좌표가 없는(0,0 포함) 항목은 최종 코스에 절대 들어가면 안 된다. 실측
 * (프리뷰)에서 "조용한저녁"(설명이 "저녁 정취에 맞는 감성 식당명" — 실제
 * 장소가 아니라 이름 자체를 설명하는 문구)이라는 스팟이 나온 적이 있는데,
 * v1(courseLlm.ts)·v2(courseTaste.ts) 둘 다 이미 LLM pick의 id를 실제
 * 후보 풀에 있는 id인지 검증하고 name/lat/lng는 항상 그 실제 후보 객체에서
 * 가져오므로(코드 상 LLM이 준 텍스트를 name으로 직접 쓰는 경로가 없음)
 * 정확한 재현 경로는 못 찾았다 — 그래도 구조적으로 잘못된 항목이 어떤
 * 경로로든(캐시에 남은 과거 데이터, API 자체의 이상 응답 등) 섞여 들어올
 * 가능성에 대비해 후보 풀에 들어오는 시점에 한 번 걸러낸다.
 */
export function isValidPlace(p: Place): boolean {
  return Boolean(p.id) && Boolean(p.name?.trim()) && Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0);
}

/** Live-searches one slot's candidate pool. Empty array when no API key is configured for the scope. */
export async function fetchSlotCandidates(scope: "overseas" | "domestic", city: string, slot: RecommendSlot): Promise<Place[]> {
  const cacheKey = candidateCacheKey(scope, city, slot);
  const cached = await readCandidateCache(cacheKey);
  // 캐시된 값도 걸러야 한다 — 이 검증(isValidPlace)이 추가되기 전에 이미
  // 써진 캐시 행이 place_candidate_cache의 TTL(7일) 동안 남아있을 수 있다.
  if (cached) return cached.filter(isValidPlace);

  const fresh = (await fetchSlotCandidatesLive(scope, city, slot)).filter(isValidPlace);
  // 빈 결과는 캐시하지 않는다 — 진짜 "이 검색은 결과가 없다"인지, API가
  // 일시적으로 실패해 빈 배열이 온 건지(googleTop/kakaoTop 둘 다 !res.ok면
  // 조용히 []을 반환) 구분할 수 없어, 다음 요청은 항상 다시 라이브로
  // 시도하게 둔다.
  if (fresh.length > 0) await writeCandidateCache(cacheKey, fresh);
  return fresh;
}

async function fetchSlotCandidatesLive(scope: "overseas" | "domestic", city: string, slot: RecommendSlot): Promise<Place[]> {
  if (scope === "overseas") {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return [];
    const type = slot.category ? CATEGORY_TYPE[slot.category] : undefined;
    const label = slot.category ? CATEGORY_LABEL[slot.category] : "";
    const results = await googleTop(`${city} ${slot.keyword}${label ? " " + label : ""}`, apiKey, type);
    return results.map((p) => googleToPlace(p, slot.label)).slice(0, POOL_SIZE);
  }
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return [];
  const categoryCode = slot.category ? KAKAO_CATEGORY_CODE[slot.category] : undefined;
  let results = await kakaoTop(`${city} ${slot.keyword}`, apiKey, categoryCode);
  // Some real spots (traditional markets, night-view streets, …) aren't
  // tagged under any of Kakao's category groups, so a strict category
  // filter can legitimately come back empty — fall back to the unfiltered
  // keyword search rather than silently returning fewer stops than before.
  if (results.length === 0 && categoryCode) {
    results = await kakaoTop(`${city} ${slot.keyword}`, apiKey);
  }
  return results.map((d) => kakaoToPlace(d, slot.label)).slice(0, POOL_SIZE);
}

/** Candidates left after the exclude filters, further narrowed to `maxDistanceKm` of `anchor` when that doesn't empty the pool entirely — a sparse area (rural/overseas leg) with nothing that close just falls back to the unfiltered set rather than breaking course generation. */
function eligiblePool(candidates: Place[], excludeIds: Set<string>, excludeNames: string[], anchor: { lat: number; lng: number } | null, maxDistanceKm: number | null): Place[] {
  const base = candidates.filter((p) => !excludeIds.has(p.id) && !excludeNames.some((n) => sameShop(n, p.name)));
  if (!anchor || maxDistanceKm == null) return base;
  const within = base.filter((p) => p.lat && p.lng && distKm(anchor.lat, anchor.lng, p.lat, p.lng) <= maxDistanceKm);
  return within.length > 0 ? within : base;
}

/** Whether a closer alternative exists within `maxDistanceKm` of `anchor` — used to decide whether an LLM pick that lands outside the radius should be overridden. */
export function hasWithinRadiusCandidate(candidates: Place[], excludeIds: Set<string>, excludeNames: string[], anchor: { lat: number; lng: number } | null, maxDistanceKm: number | null): boolean {
  if (!anchor || maxDistanceKm == null) return true;
  return candidates.some((p) => !excludeIds.has(p.id) && !excludeNames.some((n) => sameShop(n, p.name)) && p.lat && p.lng && distKm(anchor.lat, anchor.lng, p.lat, p.lng) <= maxDistanceKm);
}

/** Whether `place` itself is within `maxDistanceKm` of `anchor` (always true when either is absent — nothing to constrain against). */
export function isWithinRadius(place: Place, anchor: { lat: number; lng: number } | null, maxDistanceKm: number | null): boolean {
  if (!anchor || maxDistanceKm == null || !place.lat || !place.lng) return true;
  return distKm(anchor.lat, anchor.lng, place.lat, place.lng) <= maxDistanceKm;
}

/** Best still-unused candidate for a slot, biased toward `anchor` (usually a neighboring stop); random among the top 3 so re-runs vary. `maxDistanceKm` hard-caps how far from `anchor` a pick may be, falling back to the unfiltered pool when nothing qualifies. */
export function pickDeterministic(
  candidates: Place[],
  excludeIds: Set<string>,
  excludeNames: string[],
  anchor: { lat: number; lng: number } | null,
  maxDistanceKm: number | null = null,
): Place | undefined {
  const pool = eligiblePool(candidates, excludeIds, excludeNames, anchor, maxDistanceKm)
    .sort((a, b) => proximityScore(b.rating, b.reviewCount, b.lat, b.lng, anchor) - proximityScore(a.rating, a.reviewCount, a.lat, a.lng, anchor))
    .slice(0, 3);
  return pool[Math.floor(Math.random() * pool.length)];
}
