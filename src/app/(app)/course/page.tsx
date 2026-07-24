"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Check, Plus, Sparkles, X, CalendarDays, RefreshCw } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { Button } from "@/components/ui/button";
import { MonthCalendar } from "@/components/MonthCalendar";
import { PlacePager } from "@/components/PlacePager";
import { MapProvider } from "@/app/(app)/planner/MapProvider";
import { PlaceDetailOverlay } from "@/app/(app)/planner/PlaceDetailOverlay";
import { useItineraryStore } from "@/store/itineraryStore";
import { fetchLivePlaceSearch, fetchRecommendedCourse, fetchRerolledStop, type RecommendedStop, type CourseTheme } from "@/lib/api";
import { COURSE_SLOTS, courseNodesAtPath, courseRegionTree, searchableDepth, type CourseSlot } from "@/lib/courseRegions";
import { todayISODate, pad2, formatDateLabel } from "@/lib/timeline";
import { LIVE_SORTS, sortPlaces, type LiveSortKey } from "@/lib/placeSort";
import type { DiscoverScope } from "@/lib/discoverData";
import type { Place } from "@/lib/types";

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

// ── representative photo behind a scope/region tile — live Google Places
// lookup by name (same /api/discover/spot-photo proxy CourseSpotCard's
// no-photoName fallback already uses), gracefully falling back to a plain
// gradient if the API has no key or no match for that query. ──
function TilePhoto({ query, className }: { query: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className={`bg-gradient-to-br from-indigo-400 to-violet-500 ${className ?? ""}`} />;
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

export default function CourseBuilderPage() {
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
  const [toast, setToast] = useState<string | null>(null);
  // finish sheet: null = closed; otherwise the mode being configured.
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishDate, setFinishDate] = useState(todayISODate());
  // AI 추천 동선 (auto-assembled full-day course).
  const [aiCourse, setAiCourse] = useState<RecommendedStop[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTheme, setAiTheme] = useState<CourseTheme>("balanced");
  // slotKey of the stop currently being rerolled — null when none in flight.
  const [rerollingSlot, setRerollingSlot] = useState<string | null>(null);

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

  // "AI 추천으로 자동 완성" — pull a full auto-assembled day course for the
  // city (aiCity, not the drilled-down neighborhood) and drop it straight
  // onto the planner timeline.
  const runAiRecommend = async () => {
    if (!aiCity) return;
    setAiLoading(true);
    const course = await fetchRecommendedCourse(scope, aiCity, aiTheme);
    setAiLoading(false);
    setAiCourse(course);
  };

  // 특정 시간대(슬롯)를 코스에서 빼기 — 그 시간은 빈 채로 남는다.
  const removeAiStop = (slotKey: string) => {
    setAiCourse((cur) => (cur ? cur.filter((s) => s.slotKey !== slotKey) : cur));
  };

  // 특정 시간대만 다시 추천받기 — 나머지 동선은 그대로 두고 이 한 곳만 교체.
  const rerollAiStop = async (slotKey: string) => {
    if (!aiCourse || !aiCity) return;
    setRerollingSlot(slotKey);
    const next = await fetchRerolledStop(scope, aiCity, aiTheme, slotKey, aiCourse);
    setRerollingSlot(null);
    if (!next) {
      showToast("더 추천할 곳을 찾지 못했어요");
      return;
    }
    setAiCourse((cur) => (cur ? cur.map((s) => (s.slotKey === slotKey ? next : s)) : cur));
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
              <Sparkles size={22} className="text-indigo-500" /> 코스 만들기
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
              <button key={label} onClick={() => jumpTo(i + 1) /* keep up to this segment */} className="rounded-full bg-indigo-600 px-3 py-1 font-semibold text-white">
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
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
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
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="relative h-20 w-full sm:h-24">
                    <TilePhoto query={`${path[path.length - 1]} ${c.label}`} className="absolute inset-0 h-full w-full" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
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
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-slate-300 px-3 py-3 text-center text-[13.5px] font-semibold text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-600"
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
                className="mt-4 w-full rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400"
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
            <div className="mb-2 flex flex-wrap gap-1.5">
              {AI_THEMES.map((t) => {
                const active = aiTheme === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setAiTheme(t.key)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      active ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                    }`}
                  >
                    {t.emoji} {t.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={runAiRecommend}
              disabled={aiLoading}
              className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3.5 text-left text-white shadow-md transition-opacity hover:opacity-95 disabled:opacity-60"
            >
              <Sparkles size={20} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold">
                  {aiLoading ? "AI가 코스를 짜는 중…" : `${aiCity} · ${AI_THEMES.find((t) => t.key === aiTheme)?.label} 동선 받기`}
                </span>
                <span className="block text-[11.5px] text-white/80">
                  {city && city !== aiCity
                    ? `${city}만이 아니라 ${aiCity} 전역을 오가는 하루 코스로 자동 구성`
                    : "테마에 맞춰 평점 높은 실제 장소로 하루 코스를 자동 구성"}
                </span>
              </span>
            </button>

            {/* slot tabs with pick count */}
            <p className="mb-2 text-[12px] font-medium text-slate-400">또는 카테고리별로 직접 골라보세요</p>
            <div className="flex flex-wrap gap-2">
              {COURSE_SLOTS.map((s) => {
                const count = (picks[s.key] ?? []).length;
                const active = activeSlot === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveSlot(s.key)}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      active ? "border-slate-900 bg-slate-900 text-white" : count > 0 ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <span>{s.emoji}</span>
                    {s.label}
                    {count > 0 && (
                      <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${active ? "bg-white/25 text-white" : "bg-emerald-500 text-white"}`}>
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
            <Button onClick={() => setFinishOpen(true)} className="ml-auto h-12 rounded-2xl bg-indigo-600 px-6 text-sm font-semibold hover:bg-indigo-700">
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
                <CalendarDays size={15} className="text-indigo-500" /> 날짜 정해서 일정 만들기
              </p>
              <MonthCalendar selected={finishDate} onSelect={setFinishDate} accentColor="#4f46e5" />
              <p className="mt-1 text-center text-[12px] text-slate-500">{formatDateLabel(finishDate)}에 {pickedCount}곳을 시간대별로 배치</p>
              <Button onClick={buildWithDates} className="mt-3 h-11 w-full rounded-xl bg-indigo-600 text-sm font-semibold hover:bg-indigo-700">
                이 날짜로 일정 만들기
              </Button>
            </div>

            <button
              onClick={buildRouteOnly}
              className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <CordixIcon name="compass" size={18} className="shrink-0 text-emerald-500" />
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
                <Sparkles size={18} className="text-indigo-500" /> {aiCity} AI 추천 동선
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
                  <div className="relative space-y-1 pl-4">
                    {/* vertical line */}
                    <span className="absolute bottom-2 left-[7px] top-2 w-px bg-slate-200" />
                    {aiCourse.map((stop) => {
                      const isRerolling = rerollingSlot === stop.slotKey;
                      return (
                        <div key={stop.slotKey} className="relative flex items-center gap-3 py-2">
                          <span className={`absolute -left-4 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${stop.meal ? "bg-amber-400" : "bg-indigo-500"}`} />
                          <span className="w-11 shrink-0 text-[12px] font-semibold tabular-nums text-slate-400">{pad2(stop.hour)}:00</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold text-slate-800">
                              {stop.meal && <span className="mr-1 text-amber-500">🍴</span>}
                              {isRerolling ? "다른 곳 찾는 중…" : stop.name}
                            </p>
                            <p className="truncate text-[11px] text-slate-400">
                              {stop.slotLabel}
                              {stop.rating != null && ` · ⭐ ${stop.rating.toFixed(1)}`}
                            </p>
                            {stop.reason && !isRerolling && <p className="mt-0.5 truncate text-[11px] text-indigo-500">💬 {stop.reason}</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => rerollAiStop(stop.slotKey)}
                              disabled={isRerolling}
                              aria-label={`${stop.slotLabel} 다른 곳 추천`}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-indigo-500 disabled:opacity-40"
                            >
                              <RefreshCw size={14} className={isRerolling ? "animate-spin" : ""} />
                            </button>
                            <button
                              onClick={() => removeAiStop(stop.slotKey)}
                              disabled={isRerolling}
                              aria-label={`${stop.slotLabel} 빼기`}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-500 disabled:opacity-40"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
                  <Button onClick={runAiRecommend} disabled={aiLoading} variant="outline" className="h-11 flex-1 rounded-xl border-slate-300 text-sm font-semibold">
                    전체 다시 추천
                  </Button>
                  <Button onClick={applyAiCourse} className="h-11 flex-[2] rounded-xl bg-indigo-600 text-sm font-semibold hover:bg-indigo-700">
                    이 동선으로 일정 만들기
                  </Button>
                </div>
              </>
            )}
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
  const { data, isFetching } = useQuery({
    queryKey: ["course-slot", scope, query, slot.tag ?? "none"],
    queryFn: () => fetchLivePlaceSearch(scope, query, slot.tag),
    staleTime: 5 * 60 * 1000,
  });
  const [sort, setSort] = useState<LiveSortKey>("relevance");
  const [page, setPage] = useState(1);

  if (isFetching && !data) {
    return <p className="py-16 text-center text-[13px] text-slate-400">{slot.label} 찾는 중…</p>;
  }
  const results = data ?? [];
  if (results.length === 0) {
    return (
      <p className="py-16 text-center text-[13px] text-slate-400">
        이 지역의 {slot.label} 결과를 불러오지 못했어요. (실제 검색은 배포 환경에서 동작합니다)
      </p>
    );
  }

  const sorted = sortPlaces(results, sort);
  const totalPages = Math.max(1, Math.ceil(sorted.length / SLOT_PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * SLOT_PAGE_SIZE, page * SLOT_PAGE_SIZE);

  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {LIVE_SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={`rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors ${
              sort === s.key ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

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
        picked ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-200/70 hover:-translate-y-0.5 hover:shadow-lg"
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
            picked ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-slate-100 text-slate-600 hover:bg-indigo-500 hover:text-white"
          }`}
        >
          {picked ? <><Check size={13} /> 담김 · 빼기</> : <><Plus size={13} /> 코스에 담기</>}
        </button>
      </div>
    </div>
  );
}
