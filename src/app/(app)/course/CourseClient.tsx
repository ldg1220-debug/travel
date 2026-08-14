"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Check, Plus, Sparkles, X, CalendarDays, RefreshCw, MapPin, Settings2, ChevronDown, BedDouble, ExternalLink, Pin } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { Button } from "@/components/ui/button";
import { MonthCalendar } from "@/components/MonthCalendar";
import { PlacePager } from "@/components/PlacePager";
import { MapProvider } from "@/app/(app)/planner/MapProvider";
import { PlaceDetailOverlay } from "@/app/(app)/planner/PlaceDetailOverlay";
import { PlacesSearchInput } from "@/app/(app)/planner/PlacesSearchInput";
import { useItineraryStore } from "@/store/itineraryStore";
import {
  fetchLivePlaceSearch,
  fetchRecommendedCourse,
  fetchRerolledStop,
  fetchMultiDayCourse,
  logLodgingCtaEvent,
  type RecommendedStop,
  type RecommendedDayCourse,
  type EmptyStopSlot,
  type CourseTheme,
  type CourseTravelRadius,
  type CourseTravelMode,
  type CourseAnchor,
} from "@/lib/api";
import { bookingProviders, hasAffiliateLink } from "@/lib/affiliates";
import { trackFeatureEvent } from "@/lib/trackFeatureEvent";
import { useUserLocation } from "@/lib/useUserLocation";
import { useBackButtonClose } from "@/lib/useBackButtonClose";
import { COURSE_SLOTS, courseNodesAtPath, courseRegionTree, searchableDepth, type CourseSlot } from "@/lib/courseRegions";
import { todayISODate, pad2, formatDateLabel, shiftISODate } from "@/lib/timeline";
import { LIVE_SORTS, sortPlaces, type LiveSortKey } from "@/lib/placeSort";
import type { DiscoverScope } from "@/lib/discoverData";
import type { Place, Region } from "@/lib/types";

// server(courseRecommendV2.ts)의 START_ANCHOR_KEY/END_ANCHOR_KEY와 반드시 같은
// 문자열이어야 한다 — 서버 전용 파일이라 공유 모듈로 뽑는 대신 리터럴을
// 그대로 미러링했다. 이 두 슬롯 키는 사용자가 "세부 설정"에서 직접 고정한
// 시작·종료 위치라 리롤/빼기 대상이 아니다(리롤은 서버에 이 키로 된
// course.slots 항목이 없어 항상 "course-not-found"가 난다).
const START_ANCHOR_SLOT_KEY = "__start__";
const END_ANCHOR_SLOT_KEY = "__end__";

const AI_TRAVEL_MODES: { key: CourseTravelMode; emoji: string; label: string }[] = [
  { key: "walk", emoji: "🚶", label: "도보" },
  { key: "transit", emoji: "🚇", label: "대중교통" },
  { key: "car", emoji: "🚗", label: "자동차" },
];

type Step = "scope" | "drill" | "build";

// AI 추천 동선의 테마 — 고르면 하루 골격(슬롯 구성·검색 키워드)이 바뀐다.
// key는 서버 /api/course/recommend의 THEME_SLOTS와 일치해야 한다.
const AI_THEMES: { key: CourseTheme; emoji: string; label: string }[] = [
  { key: "balanced", emoji: "🧭", label: "밸런스" },
  { key: "foodie", emoji: "🍽️", label: "미식" },
  { key: "healing", emoji: "🌿", label: "힐링·감성" },
  { key: "culture", emoji: "🏛️", label: "역사·문화" },
  { key: "active", emoji: "🎢", label: "액티비티" },
];

// AI 추천 동선의 스톱 간 이동 시간 상한 — 시골/특정 해외지역은 명소 간
// 거리가 자연히 멀 수 있어 고정값 대신 선택지로 둔다. server의
// TRAVEL_RADIUS_OPTIONS와 값이 일치해야 한다.
const AI_RADIUS_OPTIONS: { minutes: CourseTravelRadius; label: string }[] = [
  { minutes: 15, label: "15분" },
  { minutes: 30, label: "30분" },
  { minutes: 60, label: "1시간" },
  { minutes: 120, label: "2시간" },
  { minutes: 0, label: "제한없음" },
];

// ── representative photo behind a scope/region tile — live Google Places
// lookup by name (same /api/discover/spot-photo proxy CourseSpotCard's
// no-photoName fallback already uses), gracefully falling back to a plain
// gradient if the API has no key or no match for that query. A bare
// gradient with nothing else on it reads as a failed image load rather
// than a deliberate placeholder (same issue discover's SpotCard had), so a
// centered pin watermark goes on top — same fallback language as
// CourseSpotCard/discover's SpotCard use elsewhere in the app.
//
// 실측(v2 UI 확인 과정에서 부수적으로 발견)에서 이 폴백이 있어도 타일이
// "회색 그라데이션으로 비어 보인다"는 피드백을 받았다 — SpotCard와 같은
// text-white/40이었는데, 여기 호출부들은 전부 그 위에 텍스트 가독성용
// 검은 그라데이션(bg-gradient-to-t from-black/45~55)을 한 겹 더 얹어서,
// 같은 40% 흰색이라도 SpotCard보다 실제로 훨씬 흐리게 보인다. 크기와
// 불투명도를 올려 그 위에서도 눈에 띄게 했다. ──
function TilePhoto({ query, className }: { query: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-brand-500 to-brand-pink-600 ${className ?? ""}`}>
        <MapPin size={36} className="text-white/80" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- /api/discover/spot-photo proxy
    <img
      src={`/api/discover/spot-photo?q=${encodeURIComponent(query)}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className ?? ""}`}
    />
  );
}

export function CourseBuilderPage() {
  const router = useRouter();
  const addPlaces = useItineraryStore((s) => s.addPlaces);
  const addItem = useItineraryStore((s) => s.addItem);
  const setCurrentCity = useItineraryStore((s) => s.setCurrentCity);

  const upsertSavedPlace = useItineraryStore((s) => s.upsertSavedPlace);

  const [step, setStep] = useState<Step>("scope");
  const [scope, setScope] = useState<DiscoverScope>("domestic");
  // 통합 지역 트리 드릴다운 경로 — 국내 [광역, 시/군], 해외 [대륙, 국가, 도시].
  const [path, setPath] = useState<string[]>([]);
  // "기타 (직접 검색)" — 목록에 없는 동네/도시 이름을 직접 입력한 경우,
  // path의 마지막 세그먼트(부모 지역) 대신 이 값을 검색 기준 도시로 쓴다.
  const [customCity, setCustomCity] = useState<string | null>(null);
  const [customSearchOpen, setCustomSearchOpen] = useState(false);
  const [customSearchInput, setCustomSearchInput] = useState("");
  // slot key -> chosen places (multiple allowed per slot)
  const [picks, setPicks] = useState<Record<string, Place[]>>({});
  const [activeSlot, setActiveSlot] = useState<string>(COURSE_SLOTS[0].key);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  // The overlay opens via local state, not a route change — without this,
  // the Android back button skips past it (and the search results
  // underneath) straight to whatever page was open before /course.
  useBackButtonClose(detailPlace !== null, () => setDetailPlace(null));
  const [toast, setToast] = useState<string | null>(null);
  // finish sheet: null = closed; otherwise the mode being configured.
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishDate, setFinishDate] = useState(todayISODate());
  // AI 추천 동선 (auto-assembled full-day course).
  const [aiCourse, setAiCourse] = useState<RecommendedStop[] | null>(null);
  // 조건에 맞는 곳을 못 찾아 빈 채로 남은 시간대들 — 타임라인에 "이
  // 시간대엔 조건에 맞는 곳을 못 찾았어요" 안내 행으로 보여준다(다일정
  // 실측에서 "12시 점심 다음 바로 16시 카페"처럼 이유 없이 몇 시간이
  // 비어 보인다는 피드백 반영).
  const [aiEmptySlots, setAiEmptySlots] = useState<EmptyStopSlot[]>([]);
  // v2 파이프라인(COURSE_PIPELINE=v2)일 때만 서버가 내려주는 값 — 리롤이
  // 이 코스의 서버 쪽 상태(쇼트리스트·원본 후보 풀·이미 보여준 곳 목록)를
  // 다시 찾는 열쇠. v1일 땐 계속 null이고, 리롤은 그때그때 클라이언트가
  // 들고 있는 aiCourse 자체로 제외 목록/앵커를 구성한다 — fetchRerolledStop
  // 참고.
  const [aiCourseId, setAiCourseId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTheme, setAiTheme] = useState<CourseTheme>("balanced");
  const [aiRadius, setAiRadius] = useState<CourseTravelRadius>(60);
  // slotKey of the stop currently being rerolled — null when none in flight.
  const [rerollingSlot, setRerollingSlot] = useState<string | null>(null);

  // "세부 설정" — 한 탭으로 끝나는 기본 흐름(테마+반경)은 그대로 두고,
  // 이동 방법·시간 예산·시작/종료 위치 고정은 전부 접힌 패널 뒤로 미룬다.
  // 기본값(mode="car", 시간/위치 비어있음)일 땐 서버로 아무 것도 안 보내
  // (options 필드가 undefined) v2의 기존 동작과 완전히 같다.
  const [aiAdvancedOpen, setAiAdvancedOpen] = useState(false);
  const [aiMode, setAiMode] = useState<CourseTravelMode>("car");
  const [aiStartTime, setAiStartTime] = useState("");
  const [aiEndTime, setAiEndTime] = useState("");
  const [aiStartAnchor, setAiStartAnchor] = useState<CourseAnchor | null>(null);
  const [aiEndAnchor, setAiEndAnchor] = useState<CourseAnchor | null>(null);
  // 순환 경로("숙소로 복귀") — 종료 위치를 시작 위치와 같은 곳으로 강제.
  const [endSameAsStart, setEndSameAsStart] = useState(false);
  const [anchorPickerOpen, setAnchorPickerOpen] = useState<"start" | "end" | "lodging" | null>(null);
  const [lodgingOpen, setLodgingOpen] = useState(false);

  // 다일정(멀티데이) — "당일"(기본)일 땐 위 상태들과 지금까지의 흐름이
  // 완전히 그대로다. 기간을 당일 외로 바꿨을 때만 아래 필드가 의미를
  // 갖는다. 위치는 aiStartAnchor/aiEndAnchor를 그대로 재사용하되(첫날
  // 도착 지점/마지막날 출발 지점으로 의미만 바뀜) 숙소는 별도 상태로 둔다
  // — 세 지점(도착·숙소·출발)을 한 번에 다뤄야 해서 기존 두 상태만으론
  // 부족하다.
  const AI_PERIODS = [
    { key: "day" as const, label: "당일", days: 1 },
    { key: "1n2d" as const, label: "1박2일", days: 2 },
    { key: "2n3d" as const, label: "2박3일", days: 3 },
    { key: "3n4d" as const, label: "3박4일", days: 4 },
    { key: "custom" as const, label: "직접 선택", days: null },
  ];
  const [aiPeriod, setAiPeriod] = useState<(typeof AI_PERIODS)[number]["key"]>("day");
  const [aiCustomDays, setAiCustomDays] = useState(5);
  const aiDays = aiPeriod === "custom" ? aiCustomDays : (AI_PERIODS.find((p) => p.key === aiPeriod)?.days ?? 1);
  const [aiLodgingAnchor, setAiLodgingAnchor] = useState<CourseAnchor | null>(null);
  const [aiMultiCourse, setAiMultiCourse] = useState<RecommendedDayCourse[] | null>(null);
  const [activeDayTab, setActiveDayTab] = useState(0);
  const [multiRerolling, setMultiRerolling] = useState<{ day: number; slotKey: string } | null>(null);
  const [multiStartDate, setMultiStartDate] = useState(todayISODate());
  const [multiDatePickerOpen, setMultiDatePickerOpen] = useState(false);
  // 순차 호출이라(day를 병렬로 못 돌림, fetchMultiDayCourse 주석 참고)
  // 오사카 3박4일 실측에서 ~40초가 걸렸는데 그동안 화면에 아무 표시가
  // 없어 멈춘 것처럼 보였다는 피드백 — 진행 중인 날짜만 간단히 보여준다.
  const [aiMultiProgress, setAiMultiProgress] = useState<{ day: number; days: number } | null>(null);

  const tree = courseRegionTree(scope);
  const options = courseNodesAtPath(tree, path);
  const maxDepth = searchableDepth(scope);
  const city = customCity ?? (path.length > 0 ? path[path.length - 1] : null);
  // AI 추천 동선은 드릴다운한 동네(예: "다대포")가 아니라 그 상위 광역시/도
  // (예: "부산")를 기준으로 검색한다 — 부산에 가면 다대포만 도는 게 아니라
  // 서면·해운대 등도 오갈 수 있어야 하므로, 하루 코스는 도시 전체에서
  // 뽑고 자연스러운 동선은 근접도 랭킹(각 스톱이 직전 스톱과 가까운 곳을
  // 우선하는 로직)이 알아서 잡아준다. 해외는 이미 "도시"(오사카 등) 단위로
  // 드릴다운이 끝나므로 그대로 둔다.
  const aiCity = scope === "domestic" && path.length > 0 ? path[0] : city;
  // affiliates.ts/PlacesSearchInput은 "international"/"domestic"(Region)을
  // 쓰고, 코스 만들기 쪽은 처음부터 "overseas"/"domestic"(DiscoverScope)을
  // 써왔다 — 이름만 다를 뿐 같은 이분법이라 여기서 한 번만 변환한다.
  const region: Region = scope === "overseas" ? "international" : "domestic";
  const lodgingProviders = useMemo(() => (aiCity ? bookingProviders(aiCity, region) : []), [aiCity, region]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  };

  /** Drill one level deeper; reaching the searchable depth (or a leaf) starts the build step. */
  const drillInto = (label: string) => {
    const next = [...path, label];
    setPath(next);
    setCustomCity(null);
    if (next.length >= maxDepth || courseNodesAtPath(tree, next).length === 0) {
      setPicks({});
      setActiveSlot(COURSE_SLOTS[0].key);
      setStep("build");
    }
  };

  /** Back one step: build → last drill level; drill → pop a level (or scope at the root). */
  const goBack = () => {
    setCustomCity(null);
    setCustomSearchOpen(false);
    if (path.length === 0) {
      setStep("scope");
      return;
    }
    setPath(path.slice(0, -1));
    setPicks({});
    setStep("drill");
  };

  /** Breadcrumb jump — truncate the path to `depth`; a searchable-depth segment reopens the build step, anything shallower reopens the drill. */
  const jumpTo = (depth: number) => {
    const next = path.slice(0, depth);
    setPath(next);
    setPicks({});
    setCustomCity(null);
    setCustomSearchOpen(false);
    if (depth === 0) {
      setStep("scope");
      return;
    }
    setStep(next.length >= maxDepth || courseNodesAtPath(tree, next).length === 0 ? "build" : "drill");
  };

  /** "기타 (직접 검색)" 제출 — 목록에 없는 동네/도시 이름을 직접 입력해 검색 기준으로 쓴다. */
  const submitCustomSearch = () => {
    const trimmed = customSearchInput.trim();
    if (!trimmed) return;
    setCustomCity(trimmed);
    setCustomSearchOpen(false);
    setCustomSearchInput("");
    setPicks({});
    setActiveSlot(COURSE_SLOTS[0].key);
    setStep("build");
  };

  // Flattened picks in slot order (관광지 → 점심 → … ), preserving pick
  // order within a slot — the assembled 동선.
  const orderedPicks = useMemo(
    () => COURSE_SLOTS.flatMap((s) => (picks[s.key] ?? []).map((place) => ({ slot: s, place }))),
    [picks],
  );
  const pickedCount = orderedPicks.length;

  const togglePick = (slotKey: string, place: Place) => {
    setPicks((prev) => {
      const cur = prev[slotKey] ?? [];
      const exists = cur.some((p) => p.id === place.id);
      const next = exists ? cur.filter((p) => p.id !== place.id) : [...cur, place];
      showToast(exists ? `${place.name} 코스에서 뺌` : `${place.name} 코스에 담음`);
      return { ...prev, [slotKey]: next };
    });
  };

  // "날짜 정하기" — schedule every pick on the chosen date. Times are
  // spread evenly across the day so multi-pick courses don't collide
  // (addItem replaces overlaps), preserving the slot order.
  const buildWithDates = () => {
    if (orderedPicks.length === 0) return;
    addPlaces(orderedPicks.map((c) => c.place));
    const n = orderedPicks.length;
    const step = n <= 7 ? 2 : 1; // hours between stops
    orderedPicks.forEach(({ place }, i) => {
      const hour = Math.min(9 + i * step, 22);
      addItem({
        placeId: place.id,
        name: place.name,
        date: finishDate,
        time: `${pad2(hour)}:00`,
        coordinates: { lat: place.lat, lng: place.lng },
      });
    });
    if (city) setCurrentCity(city);
    setFinishOpen(false);
    router.push("/planner");
  };

  // "동선만 짜기" — no dates; just scrap every pick as a 관심 장소 so the
  // user can arrange the route on the map without committing to times.
  const buildRouteOnly = () => {
    if (orderedPicks.length === 0) return;
    orderedPicks.forEach(({ place }) => upsertSavedPlace(place));
    if (city) setCurrentCity(city);
    setFinishOpen(false);
    router.push("/saved-places");
  };

  // "AI 추천으로 자동 완성" — 당일(기본, aiDays===1)이면 기존 흐름 그대로
  // 하루 코스 하나를 받아온다. 기간을 당일 외로 바꿨을 때만 다일정
  // 경로(fetchMultiDayCourse)를 탄다 — 당일 UI/결과가 이 분기로 인해
  // 조금이라도 달라지지 않게, 두 경로를 완전히 분리해뒀다.
  const runAiRecommend = async () => {
    if (!aiCity) return;
    if (aiDays > 1) {
      setAiLoading(true);
      const days = await fetchMultiDayCourse(
        scope,
        aiCity,
        aiTheme,
        aiRadius,
        aiDays,
        aiMode,
        {
          lodging: aiLodgingAnchor ?? undefined,
          arrival: aiStartAnchor ?? undefined,
          arrivalTime: aiStartTime || undefined,
          departure: aiEndAnchor ?? undefined,
          departureTime: aiEndTime || undefined,
        },
        (day, daysCount) => setAiMultiProgress({ day, days: daysCount }),
      );
      setAiLoading(false);
      setAiMultiProgress(null);
      setActiveDayTab(0);
      setAiMultiCourse(days);
      trackFeatureEvent("course_generate", "course", { scope, days: aiDays, theme: aiTheme });
      return;
    }
    setAiLoading(true);
    const effectiveEndAnchor = endSameAsStart ? aiStartAnchor : aiEndAnchor;
    const { stops, courseId, emptySlots } = await fetchRecommendedCourse(scope, aiCity, aiTheme, aiRadius, {
      mode: aiMode,
      startTime: aiStartTime || undefined,
      endTime: aiEndTime || undefined,
      startAnchor: aiStartAnchor ?? undefined,
      endAnchor: effectiveEndAnchor ?? undefined,
    });
    setAiLoading(false);
    setAiCourse(stops);
    setAiCourseId(courseId);
    setAiEmptySlots(emptySlots);
    trackFeatureEvent("course_generate", "course", { scope, days: 1, theme: aiTheme });
  };

  // 특정 시간대(슬롯)를 코스에서 빼기 — 그 시간은 빈 채로 남는다.
  const removeAiStop = (slotKey: string) => {
    setAiCourse((cur) => (cur ? cur.filter((s) => s.slotKey !== slotKey) : cur));
  };

  // 특정 시간대만 다시 추천받기 — 나머지 동선은 그대로 두고 이 한 곳만 교체.
  const rerollAiStop = async (slotKey: string) => {
    if (!aiCourse || !aiCity) return;
    setRerollingSlot(slotKey);
    const next = await fetchRerolledStop(scope, aiCity, aiTheme, slotKey, aiCourse, aiRadius, aiCourseId);
    setRerollingSlot(null);
    if (!next) {
      showToast("더 추천할 곳을 찾지 못했어요");
      return;
    }
    setAiCourse((cur) => (cur ? cur.map((s) => (s.slotKey === slotKey ? next : s)) : cur));
    trackFeatureEvent("course_reroll", "course", { scope, city: aiCity, theme: aiTheme, slot: slotKey });
  };

  const applyAiCourse = () => {
    if (!aiCourse || aiCourse.length === 0) return;
    const date = todayISODate();
    addPlaces(aiCourse);
    aiCourse.forEach((stop) => {
      addItem({
        placeId: stop.id,
        name: stop.name,
        date,
        time: `${pad2(stop.hour)}:00`,
        coordinates: { lat: stop.lat, lng: stop.lng },
      });
    });
    if (aiCity) setCurrentCity(aiCity);
    setAiCourse(null);
    trackFeatureEvent("course_save", "course", { scope, days: 1 });
    router.push("/planner");
  };

  // 다일정 — 한 날짜의 한 슬롯만 빼기. 그 날짜의 stops 배열만 갱신한다.
  const removeMultiDayStop = (day: number, slotKey: string) => {
    setAiMultiCourse((cur) => (cur ? cur.map((d) => (d.day === day ? { ...d, stops: d.stops.filter((s) => s.slotKey !== slotKey) } : d)) : cur));
  };

  // 다일정 리롤 — 그 날짜는 이미 자기 courseId로 서버에 독립 캐시돼 있어
  // (fetchMultiDayCourse가 하루씩 fetchRecommendedCourse를 호출하므로) 단일
  // 코스 리롤과 거의 같은 계약이다. 다만 서버의 course.shownIds는 그
  // 날짜 안의 이력만 알기 때문에, 다른 날짜에서 이미 쓴 장소 id를
  // extraExcludeIds로 같이 보내 리롤이 날짜를 넘어 중복 추천하지 않게 한다.
  const rerollMultiDayStop = async (day: number, slotKey: string) => {
    if (!aiMultiCourse || !aiCity) return;
    const dayCourse = aiMultiCourse.find((d) => d.day === day);
    if (!dayCourse) return;
    setMultiRerolling({ day, slotKey });
    const otherDaysIds = aiMultiCourse.filter((d) => d.day !== day).flatMap((d) => d.stops.map((s) => s.id));
    const next = await fetchRerolledStop(scope, aiCity, aiTheme, slotKey, dayCourse.stops, aiRadius, dayCourse.courseId, otherDaysIds);
    setMultiRerolling(null);
    if (!next) {
      showToast("더 추천할 곳을 찾지 못했어요");
      return;
    }
    trackFeatureEvent("course_reroll", "course", { scope });
    trackFeatureEvent("course_reroll", "course", { scope, city: aiCity, theme: aiTheme, slot: slotKey, day });
    setAiMultiCourse((cur) =>
      cur ? cur.map((d) => (d.day === day ? { ...d, stops: d.stops.map((s) => (s.slotKey === slotKey ? next : s)) } : d)) : cur,
    );
  };

  const applyMultiDayCourse = () => {
    if (!aiMultiCourse || aiMultiCourse.every((d) => d.stops.length === 0)) return;
    aiMultiCourse.forEach((dayCourse) => {
      const date = shiftISODate(multiStartDate, dayCourse.day - 1);
      addPlaces(dayCourse.stops);
      dayCourse.stops.forEach((stop) => {
        addItem({
          placeId: stop.id,
          name: stop.name,
          date,
          time: `${pad2(stop.hour)}:00`,
          coordinates: { lat: stop.lat, lng: stop.lng },
        });
      });
    });
    if (aiCity) setCurrentCity(aiCity);
    setAiMultiCourse(null);
    trackFeatureEvent("course_save", "course", { scope, days: aiMultiCourse.length });
    router.push("/planner");
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-32 pt-8 sm:px-6">
        {/* header */}
        <div className="mb-6 flex items-center gap-3">
          {step !== "scope" && (
            <button
              onClick={goBack}
              aria-label="뒤로"
              className="flex h-10 items-center gap-1 rounded-full border border-slate-300 bg-white pl-2 pr-3.5 text-[13.5px] font-semibold text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50"
            >
              <ChevronLeft size={19} /> 뒤로
            </button>
          )}
          <div>
            <h1 className="flex items-center gap-1.5 text-2xl font-bold tracking-tight">
              <Sparkles size={22} className="text-brand-600" /> 코스 만들기
            </h1>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {step === "scope" && "국내 여행부터 시작해볼까요?"}
              {step === "drill" &&
                (scope === "domestic"
                  ? path.length === 0
                    ? "어느 지역으로 떠나시나요?"
                    : `${path[path.length - 1]} 안에서 지역을 골라주세요`
                  : path.length === 0
                    ? "어느 대륙으로 떠나시나요?"
                    : path.length === 1
                      ? `${path[0]}에서 나라를 골라주세요`
                      : `${path[path.length - 1]}에서 도시를 골라주세요`)}
              {step === "build" && `${city} 코스를 카테고리별로 채워보세요 (여러 곳 담기 가능)`}
            </p>
          </div>
        </div>

        {/* breadcrumb — 드릴다운 경로, 누르면 그 단계로 점프 */}
        {path.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-1.5 text-[12px]">
            {path.map((label, i) => (
              <button key={label} onClick={() => jumpTo(i + 1) /* keep up to this segment */} className="rounded-full bg-brand-700 px-3 py-1 font-semibold text-white">
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── STEP: scope ── */}
        {step === "scope" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="grid w-full grid-cols-2 gap-5">
              {([
                { key: "domestic" as const, label: "국내 여행", flag: "🇰🇷", desc: "카카오맵 기준 실제 장소", photoQuery: "경복궁 야경" },
                { key: "overseas" as const, label: "해외 여행", flag: "🌐", desc: "구글맵 기준 실제 장소·평점", photoQuery: "파리 에펠탑 야경" },
              ]).map((s) => (
                <button
                  key={s.key}
                  onClick={() => { setScope(s.key); setPath([]); setStep("drill"); }}
                  className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="relative h-48 w-full sm:h-72">
                    <TilePhoto query={s.photoQuery} className="absolute inset-0 h-full w-full" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
                    <span className="absolute left-4 top-4 text-4xl drop-shadow-md">{s.flag}</span>
                  </div>
                  <div className="p-5">
                    <span className="block text-xl font-bold">{s.label}</span>
                    <span className="mt-1 block text-[13.5px] text-slate-500">{s.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: drill (국내 광역→지역 / 해외 대륙→국가→도시 — 탐색의 지역별과 같은 통합 트리) ── */}
        {step === "drill" &&
          (path.length === 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {options.map((r) => (
                <button
                  key={r.label}
                  onClick={() => drillInto(r.label)}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md"
                >
                  <div className="relative h-36 w-full sm:h-44">
                    <TilePhoto query={`${r.label} 여행`} className="absolute inset-0 h-full w-full" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <span className="absolute left-3 top-3 text-2xl drop-shadow-md">{r.emoji ?? "📍"}</span>
                  </div>
                  <span className="px-3.5 py-3 text-[15px] font-semibold">{r.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {options.map((c) => (
                <button
                  key={c.label}
                  onClick={() => drillInto(c.label)}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md"
                >
                  <div className="relative h-20 w-full sm:h-24">
                    <TilePhoto query={`${path[path.length - 1]} ${c.label}`} className="absolute inset-0 h-full w-full" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                    {/* 위 두 단계(scope/1차 드릴)는 큰 이모지 오버레이가 있는데
                        여기만 없어서, 사진 조회가 실패하면(짧은 지명은 Places
                        검색이 자주 빗나간다) 이 단계 타일만 유독 아무 표식
                        없이 비어 보였다. c.emoji는 이 깊이(국내 시/군, 해외
                        도시)에선 데이터 자체가 항상 undefined라(withEmoji가
                        나라 이름 기준으로만 매핑, courseRegions.ts 참고)
                        `c.emoji &&` 조건부로는 절대 안 뜬다 — 1차 드릴과
                        같은 "없으면 기본 핀"(?? "📍") 패턴으로 항상 뭔가
                        보이게 한다. */}
                    <span className="absolute left-2.5 top-2 text-lg drop-shadow-md">{c.emoji ?? "📍"}</span>
                  </div>
                  <span className="px-3 py-2.5 text-[13.5px] font-semibold">
                    {c.emoji ? `${c.emoji} ` : ""}
                    {c.label}
                  </span>
                </button>
              ))}
              {/* 목록에 원하는 동네/도시가 없을 때 — 직접 이름을 입력해 그
                  검색어로 큐레이션 목록 밖 장소도 찾을 수 있게 한다. */}
              {path.length === maxDepth - 1 && (
                <button
                  onClick={() => setCustomSearchOpen(true)}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-slate-300 px-3 py-3 text-center text-[13.5px] font-semibold text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-400 hover:text-brand-700"
                >
                  기타
                  <br />
                  (직접 검색)
                </button>
              )}
            </div>
          ))}

        {step === "drill" && customSearchOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0"
            onClick={() => setCustomSearchOpen(false)}
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
            <div className="relative w-full max-w-[360px] rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <p className="text-[15px] font-bold text-slate-900">동네·도시 이름을 입력해주세요</p>
              <p className="mt-0.5 text-[12.5px] text-slate-500">목록에 없는 곳도 이름으로 바로 찾을 수 있어요</p>
              <input
                autoFocus
                value={customSearchInput}
                onChange={(e) => setCustomSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCustomSearch();
                }}
                placeholder={path.length > 0 ? `예: ${path[path.length - 1]} OO동` : "예: 을왕리"}
                className="mt-4 w-full rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
              />
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setCustomSearchOpen(false)}
                  className="h-11 flex-1 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  onClick={submitCustomSearch}
                  disabled={!customSearchInput.trim()}
                  className="h-11 flex-1 rounded-2xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
                >
                  검색
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: build course ── */}
        {step === "build" && city && (
          <div>
            {/* AI 자동 추천 — 테마를 고르고 한 번에 동선 받기 */}
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {AI_THEMES.map((t) => {
                const active = aiTheme === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setAiTheme(t.key)}
                    aria-pressed={active}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-400"
                    }`}
                  >
                    {t.emoji} {t.label}
                  </button>
                );
              })}
            </div>
            <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-[11.5px] font-medium text-slate-400">이동 반경</span>
              {AI_RADIUS_OPTIONS.map((r) => {
                const active = aiRadius === r.minutes;
                return (
                  <button
                    key={r.minutes}
                    onClick={() => setAiRadius(r.minutes)}
                    aria-pressed={active}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                      active ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>

            {/* 세부 설정 — 이동 방법·시간 예산·시작/종료 위치 고정. 기본
                한 탭 흐름을 안 건드리려고 기본은 접혀 있다. */}
            <button
              type="button"
              onClick={() => setAiAdvancedOpen((v) => !v)}
              aria-expanded={aiAdvancedOpen}
              className="mb-2 flex items-center gap-1 text-[11.5px] font-semibold text-slate-500 hover:text-brand-700"
            >
              <Settings2 size={12} />
              세부 설정
              {(aiStartAnchor || aiEndAnchor || aiStartTime || aiEndTime || aiMode !== "car" || aiDays > 1) && (
                <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">적용됨</span>
              )}
              <ChevronDown size={12} className={`transition-transform ${aiAdvancedOpen ? "rotate-180" : ""}`} />
            </button>

            {aiAdvancedOpen && (
              <div className="mb-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-500">여행 기간</p>
                  <div className="flex flex-wrap gap-1.5">
                    {AI_PERIODS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setAiPeriod(p.key)}
                        aria-pressed={aiPeriod === p.key}
                        className={`rounded-xl border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                          aiPeriod === p.key ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {aiPeriod === "custom" && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={7}
                        value={aiCustomDays}
                        onChange={(e) => setAiCustomDays(Math.min(7, Math.max(1, Number(e.target.value) || 1)))}
                        aria-label="여행 일수"
                        className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-brand-500"
                      />
                      <span className="text-[11.5px] text-slate-500">일 (최대 7일)</span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-500">이동 방법</p>
                  <div className="flex gap-1.5">
                    {AI_TRAVEL_MODES.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setAiMode(m.key)}
                        aria-pressed={aiMode === m.key}
                        className={`flex-1 rounded-xl border px-2 py-1.5 text-[12px] font-semibold transition-colors ${
                          aiMode === m.key ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {m.emoji} {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[10.5px] text-slate-400">위 &ldquo;이동 반경&rdquo;이 실제로 얼마나 먼 거리인지는 이동 방법에 따라 달라져요.</p>
                </div>

                {aiDays === 1 ? (
                  <>
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-500">시간 예산 (선택)</p>
                      <div className="flex gap-2">
                        <input
                          type="time"
                          value={aiStartTime}
                          onChange={(e) => setAiStartTime(e.target.value)}
                          aria-label="시작 시각"
                          className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-brand-500"
                        />
                        <span className="self-center text-slate-300">–</span>
                        <input
                          type="time"
                          value={aiEndTime}
                          onChange={(e) => setAiEndTime(e.target.value)}
                          aria-label="종료 시각"
                          className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-brand-500"
                        />
                      </div>
                      <p className="mt-1 text-[10.5px] text-slate-400">
                        둘 다 입력하면 그 시간 안에서 코스를 짜요. 비워두면 기본 골격(오전~밤)을 써요.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-500">시작·종료 위치 (선택)</p>
                      <AnchorRow label="시작" anchor={aiStartAnchor} onPick={() => setAnchorPickerOpen("start")} onClear={() => setAiStartAnchor(null)} />
                      <label className="flex items-center gap-1.5 pl-0.5 text-[11px] text-slate-500">
                        <input type="checkbox" checked={endSameAsStart} onChange={(e) => setEndSameAsStart(e.target.checked)} className="accent-brand-600" />
                        도착지를 시작 위치와 동일하게 (숙소로 복귀)
                      </label>
                      {!endSameAsStart && (
                        <AnchorRow label="종료" anchor={aiEndAnchor} onPick={() => setAnchorPickerOpen("end")} onClear={() => setAiEndAnchor(null)} />
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-500">숙소 (선택)</p>
                      <AnchorRow label="숙소" anchor={aiLodgingAnchor} onPick={() => setAnchorPickerOpen("lodging")} onClear={() => setAiLodgingAnchor(null)} />
                      <p className="text-[10.5px] text-slate-400">정해두면 매일 아침 출발·저녁 복귀 지점으로 자동으로 쓰여요.</p>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-500">도착 지점 · Day 1 (선택)</p>
                      <AnchorRow label="도착" anchor={aiStartAnchor} onPick={() => setAnchorPickerOpen("start")} onClear={() => setAiStartAnchor(null)} />
                      <input
                        type="time"
                        value={aiStartTime}
                        onChange={(e) => setAiStartTime(e.target.value)}
                        aria-label="도착 시각"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-brand-500"
                      />
                      <p className="text-[10.5px] text-slate-400">비워두면 숙소를 시작 지점으로, 하루 전체를 기본 골격으로 짜요.</p>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-500">출발 지점 · Day {aiDays} (선택)</p>
                      <AnchorRow label="출발" anchor={aiEndAnchor} onPick={() => setAnchorPickerOpen("end")} onClear={() => setAiEndAnchor(null)} />
                      <input
                        type="time"
                        value={aiEndTime}
                        onChange={(e) => setAiEndTime(e.target.value)}
                        aria-label="출발 시각"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-brand-500"
                      />
                    </div>
                  </>
                )}

                {aiCity && (
                  <button
                    type="button"
                    onClick={() => {
                      setLodgingOpen(true);
                      logLodgingCtaEvent("open", "course", aiCity, region);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-left transition-colors hover:border-brand-400"
                  >
                    <BedDouble size={17} className="shrink-0 text-brand-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-bold text-brand-800">숙소 정하셨나요?</span>
                      <span className="block text-[10.5px] text-brand-600">
                        {aiDays > 1 ? "숙소를 정하면 매일의 시작·종료가 자동으로 채워져요" : "먼저 정하면 시작·종료 위치로 바로 쓸 수 있어요"}
                      </span>
                    </span>
                  </button>
                )}
              </div>
            )}

            <button
              onClick={runAiRecommend}
              disabled={aiLoading}
              className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-pink-600 px-4 py-3.5 text-left text-white shadow-md transition-opacity hover:opacity-95 disabled:opacity-60"
            >
              <Sparkles size={20} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold">
                  {aiLoading
                    ? aiMultiProgress
                      ? `Day ${aiMultiProgress.day} / ${aiMultiProgress.days} 구성 중…`
                      : "AI가 코스를 짜는 중…"
                    : `${aiCity} · ${AI_THEMES.find((t) => t.key === aiTheme)?.label} ${aiDays > 1 ? `${aiDays}일 동선` : "동선"} 받기`}
                </span>
                <span className="block text-[11.5px] text-white/80">
                  {aiDays > 1
                    ? `${aiDays}일 전체를 한 번에 자동 구성 (날짜마다 다른 곳으로)`
                    : city && city !== aiCity
                      ? `${city}만이 아니라 ${aiCity} 전역을 오가는 하루 코스로 자동 구성`
                      : "테마에 맞춰 평점 높은 실제 장소로 하루 코스를 자동 구성"}
                </span>
              </span>
            </button>

            {/* slot tabs with pick count */}
            <p className="mb-2 text-[12px] font-medium text-slate-400">또는 카테고리별로 직접 골라보세요</p>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {COURSE_SLOTS.map((s) => {
                const count = (picks[s.key] ?? []).length;
                const active = activeSlot === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveSlot(s.key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      active ? "border-slate-900 bg-slate-900 text-white" : count > 0 ? "border-success-300 bg-success-50 text-success-700" : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <span>{s.emoji}</span>
                    {s.label}
                    {count > 0 && (
                      <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${active ? "bg-white/25 text-white" : "bg-success-500 text-white"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <SlotResults
              // 도시/탭이 바뀌면 통째로 새로 마운트해서 정렬·페이지 상태를
              // 리셋한다 — useEffect로 setState하는 것보다 이쪽이 깔끔하다.
              key={`${city}-${activeSlot}`}
              scope={scope}
              city={city}
              slot={COURSE_SLOTS.find((s) => s.key === activeSlot)!}
              pickedIds={(picks[activeSlot] ?? []).map((p) => p.id)}
              onToggle={(place) => togglePick(activeSlot, place)}
              onOpenDetail={setDetailPlace}
            />

            {/* running course summary — the assembled 동선 in slot order */}
            {pickedCount > 0 && (
              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-[13px] font-bold text-slate-700">내 코스 ({pickedCount}곳)</p>
                <div className="space-y-2">
                  {orderedPicks.map(({ slot, place }) => (
                    <div key={`${slot.key}-${place.id}`} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2">
                      <span className="text-base">{slot.emoji}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">{place.name}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{slot.label}</span>
                      <button
                        onClick={() => togglePick(slot.key, place)}
                        aria-label={`${place.name} 코스에서 빼기`}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* sticky CTA */}
      {step === "build" && pickedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <span className="text-[13px] text-slate-500">{pickedCount}곳 선택됨</span>
            <Button onClick={() => setFinishOpen(true)} className="ml-auto h-12 rounded-2xl bg-brand-700 px-6 text-sm font-semibold hover:bg-brand-800">
              코스 완성하기
            </Button>
          </div>
        </div>
      )}

      {/* finish sheet — 날짜 정하기(일정) vs 동선만 짜기(관심 장소) */}
      {finishOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setFinishOpen(false)} />
          <div className="relative w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold">코스를 어떻게 담을까요?</h3>
              <button onClick={() => setFinishOpen(false)} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-200 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                <CalendarDays size={15} className="text-brand-600" /> 날짜 정해서 일정 만들기
              </p>
              <MonthCalendar selected={finishDate} onSelect={setFinishDate} accentColor="#943A00" />
              <p className="mt-1 text-center text-[12px] text-slate-500">{formatDateLabel(finishDate)}에 {pickedCount}곳을 시간대별로 배치</p>
              <Button onClick={buildWithDates} className="mt-3 h-11 w-full rounded-xl bg-brand-700 text-sm font-semibold hover:bg-brand-800">
                이 날짜로 일정 만들기
              </Button>
            </div>

            <button
              onClick={buildRouteOnly}
              className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <CordixIcon name="compass" size={18} className="shrink-0 text-success-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-slate-800">날짜 없이 동선만 짜기</span>
                <span className="block text-[11.5px] text-slate-500">관심 장소로 저장 — 지도에서 동선만 먼저 잡아보기</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {/* AI 추천 동선 미리보기 */}
      {aiCourse && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setAiCourse(null)} />
          <div className="relative flex max-h-[85%] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <h3 className="flex items-center gap-1.5 text-lg font-bold">
                <Sparkles size={18} className="text-brand-600" /> {aiCity} AI 추천 동선
              </h3>
              <button onClick={() => setAiCourse(null)} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            {aiCourse.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[13px] text-slate-400">
                  동선이 비어 있어요. (실제 추천은 배포 환경에서 동작합니다)
                </p>
                <Button onClick={runAiRecommend} disabled={aiLoading} variant="outline" className="mt-4 h-10 rounded-xl border-slate-300 text-sm font-semibold">
                  다시 추천
                </Button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-5 py-2">
                  <CourseTimelineList
                    stops={aiCourse}
                    emptySlots={aiEmptySlots}
                    isRerolling={(slotKey) => rerollingSlot === slotKey}
                    onReroll={rerollAiStop}
                    onRemove={removeAiStop}
                  />
                </div>
                <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
                  <Button onClick={runAiRecommend} disabled={aiLoading} variant="outline" className="h-11 flex-1 rounded-xl border-slate-300 text-sm font-semibold">
                    전체 다시 추천
                  </Button>
                  <Button onClick={applyAiCourse} className="h-11 flex-[2] rounded-xl bg-brand-700 text-sm font-semibold hover:bg-brand-800">
                    이 동선으로 일정 만들기
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 다일정(멀티데이) AI 추천 동선 미리보기 — Day 탭. */}
      {aiMultiCourse && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setAiMultiCourse(null)} />
          <div className="relative flex max-h-[85%] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <h3 className="flex items-center gap-1.5 text-lg font-bold">
                <Sparkles size={18} className="text-brand-600" /> {aiCity} {aiDays}일 AI 추천 동선
              </h3>
              <button onClick={() => setAiMultiCourse(null)} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>

            <div className="flex gap-1.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {aiMultiCourse.map((d) => (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setActiveDayTab(d.day - 1)}
                  aria-pressed={activeDayTab === d.day - 1}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    activeDayTab === d.day - 1 ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  Day {d.day}
                  {d.stops.length === 0 && " · 비어있음"}
                </button>
              ))}
            </div>

            {aiMultiCourse.every((d) => d.stops.length === 0) ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[13px] text-slate-400">동선이 비어 있어요. (실제 추천은 배포 환경에서 동작합니다)</p>
                <Button onClick={runAiRecommend} disabled={aiLoading} variant="outline" className="mt-4 h-10 rounded-xl border-slate-300 text-sm font-semibold">
                  다시 추천
                </Button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-5 py-2">
                  <CourseTimelineList
                    stops={aiMultiCourse[activeDayTab]?.stops ?? []}
                    emptySlots={aiMultiCourse[activeDayTab]?.emptySlots ?? []}
                    isRerolling={(slotKey) => multiRerolling?.day === activeDayTab + 1 && multiRerolling.slotKey === slotKey}
                    onReroll={(slotKey) => rerollMultiDayStop(activeDayTab + 1, slotKey)}
                    onRemove={(slotKey) => removeMultiDayStop(activeDayTab + 1, slotKey)}
                  />
                </div>
                <div className="border-t border-slate-100 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setMultiDatePickerOpen(true)}
                    className="mb-2 flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] font-semibold text-slate-600 hover:border-brand-400"
                  >
                    <span className="flex items-center gap-1.5">
                      <CalendarDays size={13} className="text-brand-600" /> Day 1 시작일
                    </span>
                    <span>{formatDateLabel(multiStartDate)}</span>
                  </button>
                  <div className="flex gap-2">
                    <Button onClick={runAiRecommend} disabled={aiLoading} variant="outline" className="h-11 flex-1 rounded-xl border-slate-300 text-sm font-semibold">
                      전체 다시 추천
                    </Button>
                    <Button onClick={applyMultiDayCourse} className="h-11 flex-[2] rounded-xl bg-brand-700 text-sm font-semibold hover:bg-brand-800">
                      이 {aiDays}일 동선으로 일정 만들기
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 다일정 Day 1 시작일 선택. */}
      {multiDatePickerOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0" onClick={() => setMultiDatePickerOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
          <div className="relative w-full max-w-[360px] rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-slate-900">Day 1 시작일</h3>
              <button onClick={() => setMultiDatePickerOpen(false)} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <MonthCalendar
              selected={multiStartDate}
              onSelect={(d) => {
                setMultiStartDate(d);
                setMultiDatePickerOpen(false);
              }}
              accentColor="#943A00"
            />
          </div>
        </div>
      )}

      {/* 시작·종료·숙소 위치 검색 — "세부 설정"의 DP 앵커 입력. */}
      {anchorPickerOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0" onClick={() => setAnchorPickerOpen(null)}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
          <div className="relative w-full max-w-[360px] rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-slate-900">
                {anchorPickerOpen === "lodging" ? "숙소" : anchorPickerOpen === "start" ? (aiDays > 1 ? "도착 지점" : "시작 위치") : aiDays > 1 ? "출발 지점" : "종료 위치"} 검색
              </h3>
              <button onClick={() => setAnchorPickerOpen(null)} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <PlacesSearchInput
              region={region}
              surface="course"
              onSelect={(place) => {
                const anchor: CourseAnchor = { id: place.id, name: place.name, lat: place.lat, lng: place.lng };
                if (anchorPickerOpen === "start") setAiStartAnchor(anchor);
                else if (anchorPickerOpen === "end") setAiEndAnchor(anchor);
                else setAiLodgingAnchor(anchor);
                setAnchorPickerOpen(null);
              }}
            />
          </div>
        </div>
      )}

      {/* 숙소 예약 CTA — "세부 설정" 안내에서 열림. 플래너의 같은 팝업과
          같은 패턴(제휴 있으면 배지, 없으면 그냥 일반 검색 링크). */}
      {lodgingOpen && aiCity && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" onClick={() => setLodgingOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-slate-900">{aiCity} 숙소 예약</h3>
              <button onClick={() => setLodgingOpen(false)} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            {hasAffiliateLink(lodgingProviders) && <p className="mb-3 text-[11px] text-slate-400">일부 링크는 제휴 링크로, 예약 시 트레쥴에 수수료가 지급될 수 있어요.</p>}
            <div className="mt-3 space-y-2">
              {lodgingProviders.map((p) => (
                <a
                  key={p.key}
                  href={p.url}
                  target="_blank"
                  rel={p.isAffiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"}
                  onClick={() => {
                    logLodgingCtaEvent("click", "course", aiCity, region, p.label, p.isAffiliate);
                    setLodgingOpen(false);
                  }}
                  className="flex items-center justify-between rounded-2xl border px-4 py-3 text-[13.5px] font-semibold transition-colors hover:bg-slate-50"
                  style={{ borderColor: p.brand, color: p.brand }}
                >
                  <span className="flex items-center gap-1.5">
                    {p.label}
                    {p.isAffiliate && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-500">제휴</span>}
                  </span>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {detailPlace && (
        <MapProvider>
          <PlaceDetailOverlay
            place={detailPlace}
            onClose={() => setDetailPlace(null)}
            onSave={() => setDetailPlace(null)}
            onSchedule={() => setDetailPlace(null)}
          />
        </MapProvider>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900/90 px-3.5 py-2 text-xs text-white">
          {toast}
        </div>
      )}
    </div>
  );
}

const SLOT_PAGE_SIZE = 12;

// ── one slot's live search results (grid of cards, tap to add to course) ──
// 처음 뜨는 목록만으로 만족 못 할 수 있어 서버가 한 번에 더 많이(최대
// ~60개) 가져오고, 여기서 정렬 기준 선택 + 페이지 단위로 잘라 보여준다 —
// 이미 다 받아온 목록을 자르는 것뿐이라 페이지를 넘겨도 재요청은 없다.
function SlotResults({
  scope,
  city,
  slot,
  pickedIds,
  onToggle,
  onOpenDetail,
}: {
  scope: DiscoverScope;
  city: string;
  slot: CourseSlot;
  pickedIds: string[];
  onToggle: (place: Place) => void;
  onOpenDetail: (place: Place) => void;
}) {
  const query = useMemo(() => `${city} ${slot.keyword}`, [city, slot.keyword]);
  const userLoc = useUserLocation();
  const { data, isFetching } = useQuery({
    queryKey: ["course-slot", scope, query, slot.tag ?? "none", userLoc.location],
    queryFn: () => fetchLivePlaceSearch(scope, query, slot.tag, userLoc.location),
    staleTime: 5 * 60 * 1000,
  });
  const [sort, setSort] = useState<LiveSortKey>("relevance");
  const [page, setPage] = useState(1);
  const handleSortClick = (key: LiveSortKey) => {
    if (key === "distance" && !userLoc.location) {
      userLoc.request(() => setSort("distance"));
      return;
    }
    setSort(key);
  };

  // "더 보기" — same pattern as /discover's live results: extra Google
  // results fetched beyond the initial batch only when a real
  // `nextPageToken` came back (thin domestic slot searches).
  const [morePlaces, setMorePlaces] = useState<Place[]>([]);
  const [moreToken, setMoreToken] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const availableToken = moreToken !== undefined ? moreToken : data?.nextPageToken;
  const [moreResetKey, setMoreResetKey] = useState(query);
  if (moreResetKey !== query) {
    setMoreResetKey(query);
    setMorePlaces([]);
    setMoreToken(undefined);
  }
  const handleLoadMore = async () => {
    if (!availableToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchLivePlaceSearch(scope, query, slot.tag, userLoc.location, availableToken);
      setMorePlaces((prev) => {
        const seenIds = new Set([...(data?.places ?? []), ...prev].map((p) => p.id));
        return [...prev, ...more.places.filter((p) => !seenIds.has(p.id))];
      });
      setMoreToken(more.nextPageToken ?? null);
    } finally {
      setLoadingMore(false);
    }
  };

  if (isFetching && !data) {
    return <p className="py-16 text-center text-[13px] text-slate-400">{slot.label} 찾는 중…</p>;
  }
  const results = [...(data?.places ?? []), ...morePlaces];
  if (results.length === 0) {
    return (
      <p className="py-16 text-center text-[13px] text-slate-400">
        이 지역의 {slot.label} 결과를 불러오지 못했어요. (실제 검색은 배포 환경에서 동작합니다)
      </p>
    );
  }

  const sorted = sortPlaces(results, sort, userLoc.location);
  const totalPages = Math.max(1, Math.ceil(sorted.length / SLOT_PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * SLOT_PAGE_SIZE, page * SLOT_PAGE_SIZE);

  return (
    <div>
      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {LIVE_SORTS.map((s) => {
          const isDistance = s.key === "distance";
          return (
            <button
              key={s.key}
              onClick={() => handleSortClick(s.key)}
              disabled={isDistance && userLoc.locating}
              className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors disabled:opacity-60 ${
                sort === s.key ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-brand-400"
              }`}
            >
              {isDistance && <MapPin size={11} />}
              {isDistance && userLoc.locating ? "위치 확인 중…" : s.label}
            </button>
          );
        })}
      </div>
      {userLoc.error && <p className="mt-1.5 text-[11.5px] text-rose-500">{userLoc.error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        {pageItems.map((place) => (
          <CourseSpotCard
            key={place.id}
            place={place}
            slot={slot}
            city={city}
            picked={pickedIds.includes(place.id)}
            onToggle={() => onToggle(place)}
            onOpenDetail={() => onOpenDetail(place)}
          />
        ))}
      </div>

      <PlacePager page={page} totalPages={totalPages} onChange={setPage} />
      {page === totalPages && availableToken && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mx-auto mt-2 flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {loadingMore ? "찾는 중…" : "다른 결과 더 찾아보기"}
        </button>
      )}
    </div>
  );
}

// ── one course pick card — mirrors /discover's LivePlaceCard styling
// (photo + rating row + slot badge) so 코스 만들기 doesn't look like a
// stripped-down version of 여행 계획짜기. Kakao Local (국내) results never
// carry a `photoName` the way Google Places ones do, so this falls back to
// /api/discover/spot-photo's live name+city lookup — the same fallback
// discover's own curated SpotCard uses — instead of a bare gradient+pin. ──
function CourseSpotCard({
  place,
  slot,
  city,
  picked,
  onToggle,
  onOpenDetail,
}: {
  place: Place;
  slot: CourseSlot;
  city: string;
  picked: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoSrc = place.photoName
    ? `/api/places/photo?name=${encodeURIComponent(place.photoName)}&w=400`
    : `/api/discover/spot-photo?q=${encodeURIComponent(`${place.name} ${city}`)}`;

  return (
    <div
      className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${
        picked ? "border-success-400 ring-2 ring-success-200" : "border-slate-200/70 hover:-translate-y-0.5 hover:shadow-lg"
      }`}
    >
      <button onClick={onOpenDetail} className="block w-full text-left">
        <div className="relative flex h-24 items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-500">
          {!photoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- /api/places/photo or /api/discover/spot-photo proxy
            <img
              src={photoSrc}
              alt={place.name}
              loading="lazy"
              onError={() => setPhotoFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_30%_20%,white,transparent_40%)]" />
              <CordixIcon name="pin" size={22} className="text-white/90" />
            </>
          )}
          <span className="absolute right-1.5 top-1.5 rounded-full bg-white/85 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-700 backdrop-blur">
            {slot.emoji} {slot.label}
          </span>
        </div>
      </button>
      <div className="px-3 pb-3 pt-2.5">
        <p className="truncate text-[13px] font-bold text-slate-900">{place.name}</p>
        {place.rating != null ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <CordixIcon name="star" size={10} stroke="#fbbf24" accent="#fbbf24" />
            {place.rating.toFixed(1)}
            {place.reviewCount != null && <span className="font-normal text-slate-400">· {place.reviewCount.toLocaleString()}</span>}
          </p>
        ) : place.address ? (
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{place.address}</p>
        ) : null}
        <button
          onClick={onToggle}
          className={`mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-lg text-[12px] font-semibold transition-colors ${
            picked ? "bg-success-500 text-white hover:bg-success-600" : "bg-slate-100 text-slate-600 hover:bg-brand-600 hover:text-white"
          }`}
        >
          {picked ? <><Check size={13} /> 담김 · 빼기</> : <><Plus size={13} /> 코스에 담기</>}
        </button>
      </div>
    </div>
  );
}

// ── "세부 설정"의 시작/종료 위치 한 줄 — 비어있으면 검색 버튼, 골랐으면
// 이름 + 지우기. ──
// ── AI 추천 동선 미리보기의 스톱 목록 — 단일 코스 모달과 다일정 모달의
// 활성 Day 탭 양쪽에서 그대로 재사용한다(내용은 완전히 같고, 리롤/빼기
// 콜백과 "지금 리롤 중인 슬롯인지" 판정만 호출부마다 다르다). ──
// stop과 emptySlot을 hour 순으로 합쳐 렌더링할 수 있게 태그를 붙인 공용 항목.
type TimelineItem = { kind: "stop"; hour: number; stop: RecommendedStop } | { kind: "empty"; hour: number; slot: EmptyStopSlot };

function CourseTimelineList({
  stops,
  emptySlots = [],
  isRerolling,
  onReroll,
  onRemove,
}: {
  stops: RecommendedStop[];
  /** 조건에 맞는 곳을 못 찾아 빈 채로 남은 시간대 — "이 시간대엔 조건에 맞는 곳을 못 찾았어요" 안내 행으로 stops 사이에 시간순으로 끼워 넣는다. */
  emptySlots?: EmptyStopSlot[];
  isRerolling: (slotKey: string) => boolean;
  onReroll: (slotKey: string) => void;
  onRemove: (slotKey: string) => void;
}) {
  const items: TimelineItem[] = [
    ...stops.map((stop): TimelineItem => ({ kind: "stop", hour: stop.hour, stop })),
    ...emptySlots.map((slot): TimelineItem => ({ kind: "empty", hour: slot.hour, slot })),
  ].sort((a, b) => a.hour - b.hour);

  return (
    <div className="relative space-y-1 pl-4">
      {/* vertical line */}
      <span className="absolute bottom-2 left-[7px] top-2 w-px bg-slate-200" />
      {items.map((item) => {
        if (item.kind === "empty") {
          return (
            <div key={`empty-${item.slot.slotKey}`} className="relative flex items-center gap-3 py-2">
              <span className="absolute -left-4 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white border-dashed bg-slate-200" />
              <span className="w-11 shrink-0 text-[12px] font-semibold tabular-nums text-slate-300">{pad2(item.slot.hour)}:00</span>
              <p className="min-w-0 flex-1 truncate text-[12.5px] text-slate-400">
                {item.slot.slotLabel} · 조건에 맞는 곳을 못 찾았어요
              </p>
            </div>
          );
        }
        const stop = item.stop;
        const rerolling = isRerolling(stop.slotKey);
        // 사용자가 "세부 설정"에서 직접 고정한 시작·종료 위치 — 서버에
        // 리롤 가능한 슬롯 상태가 없으므로(courseRecommendV2.ts의
        // START_ANCHOR_KEY/END_ANCHOR_KEY 주석 참고) 다른 스톱과 달리
        // 다시 추천/빼기 버튼 대신 고정 배지만 보여준다.
        const isAnchor = stop.slotKey === START_ANCHOR_SLOT_KEY || stop.slotKey === END_ANCHOR_SLOT_KEY;
        return (
          <div key={stop.slotKey} className="relative flex items-center gap-3 py-2">
            <span className={`absolute -left-4 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${isAnchor ? "bg-slate-700" : stop.meal ? "bg-amber-400" : "bg-brand-600"}`} />
            <span className="w-11 shrink-0 text-[12px] font-semibold tabular-nums text-slate-400">{pad2(stop.hour)}:00</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-slate-800">
                {stop.meal && <span className="mr-1 text-amber-500">🍴</span>}
                {rerolling ? "다른 곳 찾는 중…" : stop.name}
              </p>
              <p className="truncate text-[11px] text-slate-400">
                {stop.slotLabel}
                {stop.rating != null && ` · ⭐ ${stop.rating.toFixed(1)}`}
              </p>
              {stop.reason && !rerolling && <p className="mt-0.5 truncate text-[11px] text-brand-600">💬 {stop.reason}</p>}
            </div>
            {isAnchor ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10.5px] font-semibold text-slate-500">
                <Pin size={11} /> 고정
              </span>
            ) : (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => onReroll(stop.slotKey)}
                  disabled={rerolling}
                  aria-label={`${stop.slotLabel} 다른 곳 추천`}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40"
                >
                  <RefreshCw size={14} className={rerolling ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => onRemove(stop.slotKey)}
                  disabled={rerolling}
                  aria-label={`${stop.slotLabel} 빼기`}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-500 disabled:opacity-40"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AnchorRow({
  label,
  anchor,
  onPick,
  onClear,
}: {
  label: string;
  anchor: CourseAnchor | null;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[11px] font-semibold text-slate-500">{label}</span>
      {anchor ? (
        <>
          <span className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 ring-1 ring-slate-200">{anchor.name}</span>
          <button onClick={onClear} aria-label={`${label} 위치 지우기`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200">
            <X size={13} />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="flex-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-left text-[12px] text-slate-400 hover:border-brand-400 hover:text-brand-600"
        >
          장소 검색…
        </button>
      )}
    </div>
  );
}
