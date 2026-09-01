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
export const MODE_SPEED_KMH: Record<TravelMode, number> = {
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

// 다일정(멀티데이) 4차 실측에서 확인된 원인: 슬롯별 raw 후보 풀은
// candidateCacheKey(scope+city+slot)로 캐시되는데, 같은 도시를 여러 날
// 순회하는 다일정 요청은 매일 "같은 슬롯"(예: pm-sight, 키워드 "포토존")을
// 똑같이 조회한다 — 즉 4일 내내 사실상 동일한 고정 후보 풀에서 매일
// excludeIds/excludeNames로 걸러내며 나눠 쓰는 구조라, POOL_SIZE를
// 아무리 키워도 결국 유한한 한 풀을 여러 날이 나눠 먹으면 뒤쪽 날짜(3·4일차)
// 에서 고갈된다(실측: Day1·2는 정상, Day3·4에서만 슬롯 공백 발생 — 정확히
// 이 패턴과 일치). 해법은 "더 큰 풀"이 아니라 "다른 풀" — 같은 카테고리의
// 동의어 키워드로 별도 검색을 한 번 더 돌려(전혀 다른 검색어라 Google/
// Kakao 랭킹이 실제로 다른 결과를 준다) 합치면, 날짜마다 물리적으로 겹치지
// 않는 후보군을 얻을 수 있다. widenPool(=extraQuery)이 켜졌을 때만 이
// 추가 조회가 붙는다(courseRecommendV2.ts가 3일차부터 켬 — 비용은 그
// 시점부터만 늘어남).
const CATEGORY_SYNONYM_LABEL: Record<string, string> = { attraction: "가볼만한곳", restaurant: "인기 맛집", lodging: "호텔", cafe: "핫플레이스" };

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

// googleTop()/kakaoTop() below request up to each provider's own per-call
// max (Google searchText: 20, Kakao keyword: 15 per page) — same single
// billed request either way (Places New pricing is per-request by field
// tier, not per result count), so this only ever discards already-paid-for
// candidates if set lower than that. Raised from 10 to 20 (Google's ceiling)
// for two reasons found by live testing: (1) v2's main lever for surviving
// several reroll attempts on one slot without a real second API page (see
// courseRecommendV2.ts's expandShortlist usage) — ran out too fast at 6, and
// again too fast at 10 once passesQualityGate started removing a chunk of
// the pool; (2) 다일정(멀티데이) — 뒤쪽 날짜일수록 excludeIds/excludeNames
// (이전 날짜가 이미 쓴 장소/브랜드)로 후보가 줄어드는데, 원본 풀 자체가
// 작으면(10개) 품질 게이트까지 겹쳐 슬롯이 아예 비는 걸 오사카 3박4일
// 실측(Day3 오후 명소, Day4 오후 명소·저녁 누락)에서 확인했다 — "필터를
// 느슨하게" 대신 "원본 후보를 더 가져오기"로 대응.
export const POOL_SIZE = 20;

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

// 오사카 3박4일 실측(다일정)에서 위 normName 접두 매칭이 못 잡은 실사례:
// "규카츠 모토무라 난바 분점" / "…도톤보리점" / "…난바점" — 공백 제거 후
// 비교해도 지점명 부분에서부터 서로 다른 문자열이라 어느 쪽도 다른 쪽의
// 접두사가 아니다. 지점 접미사("점"/"분점"/"본점"/"지점", 영문
// "2nd"/"Branch"/"Store" 류)를 뒤에서부터 반복 제거하고 남은 문자열의
// 앞 2어절("규카츠 모토무라", "메이드리밍 오사카")을 브랜드 키로 삼아
// 비교하는 걸 추가했다 — normName 접두 매칭(단일 어절 브랜드명, 예:
// "우오신"/"우오신 우메다점")은 그대로 두고 보조 신호로 얹는 방식이라
// 기존에 잡히던 케이스는 그대로 잡히고, 새 케이스만 추가로 잡힌다.
const BRANCH_SUFFIX_RE = /\s*(분점|본점|지점|점|\d+(st|nd|rd|th)|branch|store)$/iu;
function stripBranchSuffix(s: string): string {
  let out = s.trim();
  for (let i = 0; i < 5; i++) {
    const next = out.replace(BRANCH_SUFFIX_RE, "").trim();
    if (next === out || next.length === 0) break;
    out = next;
  }
  return out;
}
function brandKey(s: string): string {
  const words = stripBranchSuffix(s)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 2).join("");
}

// 3차 실측에서 위 brandKey(이름 맨 앞 2어절)도 못 잡은 사례: 같은 집이
// "Gyumon Dotonbori 2nd"(Day2)와 "세계에서 가장 저렴하고 맛있는 와규
// 스키야키 GYUMON"(Day3, 광고 문구가 상호 자리를 차지하고 실제 브랜드
// "GYUMON"은 맨 끝에 붙음)로 표기가 완전히 달라, "브랜드는 이름 맨
// 앞"이라는 brandKey의 가정 자체가 깨졌다. 오사카 지역명(난바/도톤보리
// 등)이 영문 상호에 흔히 섞여 있어 "공유하는 라틴 단어가 있으면 같은
// 브랜드"로 바로 판정하면 지역명만 같고 실제로는 다른 업체끼리 오탐이
// 나므로, 지역명은 차단 목록으로 제외하고 남는 라틴 단어(브랜드일 가능성이
// 높음)만 비교 신호로 쓴다.
const LOCATION_WORD_BLOCKLIST = new Set([
  "osaka", "kansai", "namba", "dotonbori", "umeda", "shinsaibashi", "tennoji", "amemura", "nipponbashi", "station", "city",
]);
function isBrandLikeLatinWord(w: string): boolean {
  return /^[a-z]+$/i.test(w) && w.length >= 3 && !LOCATION_WORD_BLOCKLIST.has(w.toLowerCase());
}
/** 이름에 포함된 "브랜드일 가능성이 높은" 라틴 단어들 — 맨 앞 단어(예: "Gyumon Dotonbori"의 "Gyumon")와 전체 대문자 토큰(예: 광고 문구 안의 "GYUMON")을 후보로 모은다. 지역명은 위 차단 목록으로 제외. */
function latinBrandTokens(s: string): string[] {
  const tokens = new Set<string>();
  const words = s.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first && isBrandLikeLatinWord(first)) tokens.add(first.toLowerCase());
  for (const m of s.match(/\b[A-Z]{3,}\b/g) ?? []) {
    if (isBrandLikeLatinWord(m)) tokens.add(m.toLowerCase());
  }
  return [...tokens];
}

export function sameShop(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (na && nb && (na.startsWith(nb) || nb.startsWith(na))) return true;
  const ka = brandKey(a);
  const kb = brandKey(b);
  if (ka && kb && ka === kb) return true;
  const latinA = latinBrandTokens(a);
  const latinB = latinBrandTokens(b);
  return latinA.some((t) => latinB.includes(t));
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
    body: JSON.stringify({ textQuery: query, maxResultCount: 20, languageCode: "ko", ...(includedType ? { includedType } : {}) }),
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
  // 15 = Kakao Local 키워드 검색의 페이지당 최대치.
  const params = new URLSearchParams({ query, size: "15" });
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

function candidateCacheKey(scope: "overseas" | "domestic", city: string, slot: RecommendSlot, extraQuery: boolean): string {
  // extraQuery(동의어 2차 검색 포함 여부)에 따라 결과 집합 자체가 다르므로
  // (기본 풀의 상위집합이 아니라 별개의, 겹치지만 다른 풀) 별도 캐시 키를
  // 쓴다 — 안 그러면 먼저 캐시를 채운 쪽(둘 중 아무거나)이 다른 쪽 요청에
  // 잘못된 크기의 풀을 돌려주게 된다.
  return `${scope}:${city.trim().toLowerCase()}:${slot.keyword}:${slot.category ?? ""}${extraQuery ? ":x2" : ""}`;
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

// 슬롯 카테고리별 최소 리뷰 수. 2차 실측(오사카 3박4일)에서 "성합지"
// (4.2)/"구치나와자카"(4.1) 같은 항목이 평점 유무 게이트는 통과해
// "리뷰 수 절대량" 기준으로 바꿨는데, 처음엔 실측 정상 스팟(오사카 성
// 9만+, 도톤보리 8.5만)에 맞춰 크게(명소 100) 올렸었다. 3차 실측에서
// 그 하한이 아래 applyQualityGate의 "부족하면 미달로 채우기" 폴백과
// 정면으로 상쇄돼(하한이 높을수록 통과 후보가 3개 미만이 되기 쉬워
// 폴백이 더 자주 발동 → 결국 미달 항목이 오히려 자주 되살아남) "형경"이
// 재등장하는 회귀가 났다 — 그래서 폴백은 아예 없앴고(아래), 하한은
// 여기서 현실적인 수준으로 낮춘다. 필터를 느슨하게 해서 슬롯이 비는
// 걸 막는 게 아니라, POOL_SIZE를 키워(위 주석 참고) 원본 후보 자체를
// 늘리는 쪽으로 대응한다.
const MIN_REVIEWS_BY_CATEGORY: Partial<Record<NonNullable<RecommendSlot["category"]>, number>> = {
  restaurant: 12,
  cafe: 10,
  attraction: 40,
  lodging: 8,
};
const DEFAULT_MIN_REVIEWS = 12;

/**
 * 평점/리뷰 수 기준 최소 품질 하한. 국내(Kakao Local)는 평점 자체를 안
 * 주므로(courseTaste.ts의 deterministicTaste 주석 참고 — 검색 순위를
 * 대신 신호로 씀) 이 검증 대상이 아니다 — 전부 걸러지는 회귀를 막기 위해
 * 항상 통과시킨다. 해외(Google)는 실제 존재하는 업체엔 거의 항상 리뷰가
 * 붙어 있어, 평점·리뷰가 아예 없거나 하한 미만인 항목은 저품질/관광
 * 관련성이 낮은 장소일 가능성이 높다고 보고 슬롯 카테고리별 하한으로
 * 거른다.
 */
export function passesQualityGate(p: Place, scope: "overseas" | "domestic", slotCategory?: RecommendSlot["category"]): boolean {
  if (scope === "domestic") return true;
  if (p.rating == null || p.reviewCount == null) return false;
  const min = slotCategory ? (MIN_REVIEWS_BY_CATEGORY[slotCategory] ?? DEFAULT_MIN_REVIEWS) : DEFAULT_MIN_REVIEWS;
  return p.reviewCount >= min;
}

/**
 * passesQualityGate를 그대로 적용하는 순수 하드 필터 — 하한 미달이어도
 * 채워 넣는 폴백을 넣지 않는다. 3차 실측에서 그 폴백이 하한 인상과
 * 서로를 상쇄한 게 확인돼(위 MIN_REVIEWS_BY_CATEGORY 주석 참고) 제거했다:
 * 필터는 단순하고 예측 가능해야 하고, 후보가 부족한 문제는 필터를
 * 느슨하게 해서가 아니라 POOL_SIZE를 키워 원본 후보를 늘리는 쪽으로
 * 풀어야 한다는 게 이번 라운드의 결론이다. 이 필터를 통과하는 후보가
 * 없으면 그 슬롯은 그냥 빈 채로 남는다(하루 코스에서 그 시간대가
 * 빠짐) — 저품질 스팟을 보여주는 것보다 낫다는 판단.
 */
export function applyQualityGate(places: Place[], scope: "overseas" | "domestic", slotCategory?: RecommendSlot["category"]): Place[] {
  return places.filter((p) => passesQualityGate(p, scope, slotCategory));
}

// 다일정(멀티데이) 실측(오사카 3박4일)에서 발견: 유니버설 스튜디오
// 재팬(테마파크)이 공항 출발일 "오전 명소" 슬롯에 1시간짜리로 배정된 적이
// 있다 — 테마파크·대형 수족관 등은 통상 하루 전체를 쓰는 장소라 그날
// 남은 일정과 현실적으로 겹치고, 출발일엔 애초에 배치 자체가 부적합하다.
// 스팟별 "권장 체류시간" 개념을 정식으로 들이는 건 범위가 커(GitHub
// issue #156에 후속 과제로 남김), 우선 최소 비용으로 가장 흔한 실패
// 사례만 막는다 — 출발일엔 이런 대형 시설을 후보에서 아예 제외.
// Google Places(New) primaryType 기준(googleToPlace가 category에 그대로
// 담는다) — Kakao Local엔 이 정도로 세분화된 타입이 없어 국내는 이
// 목록으로 걸러지는 게 사실상 없다(과잉 배제 위험이 없다는 뜻이기도 함).
const LARGE_FACILITY_TYPES = new Set(["amusement_park", "theme_park", "water_park", "aquarium", "zoo", "amusement_center"]);
export function isLargeFacility(p: Place): boolean {
  return LARGE_FACILITY_TYPES.has(p.category?.toLowerCase() ?? "");
}

// 다일정(멀티데이) 실측(오사카 3박4일)에서 관찰: 규카츠가 Day1(모토무라)·
// Day3(요사쿠라)로 2회 — 서로 다른 브랜드라 sameShop 기준 중복 억제는
// 정상 동작했지만, "같은 음식 종류가 반복된다"는 별개 축의 아쉬움이었다
// (GitHub issue #157). 스팟 이름에 이 중 하나가 포함돼 있으면 그
// 종류로 분류한다 — 업체명이 늘 음식 종류를 담고 있진 않으므로(예:
// "우오신"), 매치가 없으면 undefined를 돌려주고 그 경우 다양성 로직이
// 아예 개입하지 않는다(모르는 걸 억지로 분류하지 않음).
const CUISINE_KEYWORDS = [
  "규카츠", "라멘", "우동", "소바", "스시", "초밥", "돈카츠", "텐푸라", "오코노미야키",
  "다코야키", "야키니쿠", "샤브샤브", "스키야키", "이자카야", "카레", "오니기리",
  "불고기", "삼겹살", "곱창", "치킨", "피자", "파스타", "버거", "훠궈", "딤섬",
];
export function cuisineKeyword(name: string): string | undefined {
  return CUISINE_KEYWORDS.find((k) => name.includes(k));
}

/**
 * Live-searches one slot's candidate pool. Empty array when no API key is
 * configured for the scope.
 *
 * `extraQuery`(다일정 후반 날짜용, CATEGORY_SYNONYM_LABEL 참고) — 동의어로
 * 한 번 더 검색해 합친, 기본 풀과 "겹치지만 다른" 더 큰 풀을 쓴다.
 */
export async function fetchSlotCandidates(scope: "overseas" | "domestic", city: string, slot: RecommendSlot, extraQuery = false): Promise<Place[]> {
  const cacheKey = candidateCacheKey(scope, city, slot, extraQuery);
  // applyQualityGate(passesQualityGate 기반)는 캐시에 굽지 않고 읽는
  // 시점에만 적용한다 — 임계값을 나중에 튜닝해도 캐시 TTL(7일)을 기다리지
  // 않고 바로 반영되게 하기 위함(경계선 후보를 캐시에서 아예 지워버리면
  // 나중 튜닝으로도 못 살림). isValidPlace는 반대로 구조 자체가 틀린
  // 항목이라 캐시에 쓰기 전에 영구히 걸러낸다.
  const qualityFilter = (places: Place[]) => applyQualityGate(places, scope, slot.category);

  const cached = await readCandidateCache(cacheKey);
  // 캐시된 값도 isValidPlace로 걸러야 한다 — 이 검증이 추가되기 전에 이미
  // 써진 캐시 행이 TTL 동안 남아있을 수 있다.
  if (cached) return qualityFilter(cached.filter(isValidPlace));

  const fresh = (await fetchSlotCandidatesLive(scope, city, slot, extraQuery)).filter(isValidPlace);
  // 빈 결과는 캐시하지 않는다 — 진짜 "이 검색은 결과가 없다"인지, API가
  // 일시적으로 실패해 빈 배열이 온 건지(googleTop/kakaoTop 둘 다 !res.ok면
  // 조용히 []을 반환) 구분할 수 없어, 다음 요청은 항상 다시 라이브로
  // 시도하게 둔다.
  if (fresh.length > 0) await writeCandidateCache(cacheKey, fresh);
  return qualityFilter(fresh);
}

async function fetchSlotCandidatesLive(scope: "overseas" | "domestic", city: string, slot: RecommendSlot, extraQuery = false): Promise<Place[]> {
  if (scope === "overseas") {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return [];
    const type = slot.category ? CATEGORY_TYPE[slot.category] : undefined;
    const label = slot.category ? CATEGORY_LABEL[slot.category] : "";
    const results = await googleTop(`${city} ${slot.keyword}${label ? " " + label : ""}`, apiKey, type);
    let all = results;
    if (extraQuery) {
      const synonym = slot.category ? CATEGORY_SYNONYM_LABEL[slot.category] : undefined;
      const extra = await googleTop(`${city} ${slot.keyword}${synonym ? " " + synonym : ""}`, apiKey, type);
      const seenIds = new Set(all.map((p) => p.id));
      all = [...all, ...extra.filter((p) => !seenIds.has(p.id))];
    }
    return all.map((p) => googleToPlace(p, slot.label)).slice(0, extraQuery ? POOL_SIZE * 2 : POOL_SIZE);
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
  if (extraQuery) {
    const synonym = slot.category ? CATEGORY_SYNONYM_LABEL[slot.category] : undefined;
    const extra = await kakaoTop(`${city} ${slot.keyword}${synonym ? " " + synonym : ""}`, apiKey, categoryCode);
    const seenIds = new Set(results.map((d) => d.id));
    results = [...results, ...extra.filter((d) => !seenIds.has(d.id))];
  }
  return results.map((d) => kakaoToPlace(d, slot.label)).slice(0, extraQuery ? POOL_SIZE * 2 : POOL_SIZE);
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
