"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, MapPin, Star, Check, Plus, Sparkles, X, CalendarDays, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthCalendar } from "@/components/MonthCalendar";
import { MapProvider } from "@/app/(app)/planner/MapProvider";
import { PlaceDetailOverlay } from "@/app/(app)/planner/PlaceDetailOverlay";
import { useItineraryStore } from "@/store/itineraryStore";
import { fetchLivePlaceSearch, fetchRecommendedCourse, type RecommendedStop } from "@/lib/api";
import { COURSE_SLOTS, courseNodesAtPath, courseRegionTree, searchableDepth, type CourseSlot } from "@/lib/courseRegions";
import { todayISODate, pad2, formatDateLabel } from "@/lib/timeline";
import type { DiscoverScope } from "@/lib/discoverData";
import type { Place } from "@/lib/types";

type Step = "scope" | "drill" | "build";

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

  const tree = courseRegionTree(scope);
  const options = courseNodesAtPath(tree, path);
  const maxDepth = searchableDepth(scope);
  const city = path.length > 0 ? path[path.length - 1] : null;

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  };

  /** Drill one level deeper; reaching the searchable depth (or a leaf) starts the build step. */
  const drillInto = (label: string) => {
    const next = [...path, label];
    setPath(next);
    if (next.length >= maxDepth || courseNodesAtPath(tree, next).length === 0) {
      setPicks({});
      setActiveSlot(COURSE_SLOTS[0].key);
      setStep("build");
    }
  };

  /** Back one step: build → last drill level; drill → pop a level (or scope at the root). */
  const goBack = () => {
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
    if (depth === 0) {
      setStep("scope");
      return;
    }
    setStep(next.length >= maxDepth || courseNodesAtPath(tree, next).length === 0 ? "build" : "drill");
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
  // city and drop it straight onto the planner timeline.
  const runAiRecommend = async () => {
    if (!city) return;
    setAiLoading(true);
    const course = await fetchRecommendedCourse(scope, city);
    setAiLoading(false);
    setAiCourse(course);
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
    if (city) setCurrentCity(city);
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
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <ChevronLeft size={17} />
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
                    : `${path[path.length - 1]} 안에서 시·군을 골라주세요`
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
            <div className="grid w-full grid-cols-2 gap-4">
              {([
                { key: "domestic" as const, label: "국내 여행", flag: "🇰🇷", desc: "카카오맵 기준 실제 장소" },
                { key: "overseas" as const, label: "해외 여행", flag: "🌐", desc: "구글맵 기준 실제 장소·평점" },
              ]).map((s) => (
                <button
                  key={s.key}
                  onClick={() => { setScope(s.key); setPath([]); setStep("drill"); }}
                  className="flex flex-col items-start gap-2 rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <span className="text-4xl">{s.flag}</span>
                  <span className="text-lg font-bold">{s.label}</span>
                  <span className="text-[12px] text-slate-500">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: drill (국내 광역→시·군 / 해외 대륙→국가→도시 — 탐색의 지역별과 같은 통합 트리) ── */}
        {step === "drill" &&
          (path.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {options.map((r) => (
                <button
                  key={r.label}
                  onClick={() => drillInto(r.label)}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  <span className="text-2xl">{r.emoji ?? "📍"}</span>
                  {r.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {options.map((c) => (
                <button
                  key={c.label}
                  onClick={() => drillInto(c.label)}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-[14px] font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.label}
                </button>
              ))}
            </div>
          ))}

        {/* ── STEP: build course ── */}
        {step === "build" && city && (
          <div>
            {/* AI 자동 추천 — 직접 고르기 전에 한 번에 동선 받기 */}
            <button
              onClick={runAiRecommend}
              disabled={aiLoading}
              className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3.5 text-left text-white shadow-md transition-opacity hover:opacity-95 disabled:opacity-60"
            >
              <Sparkles size={20} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold">{aiLoading ? "AI가 코스를 짜는 중…" : `${city} AI 추천 동선 받기`}</span>
                <span className="block text-[11.5px] text-white/80">평점 높은 관광지·맛집·카페·야경을 하루 코스로 자동 구성</span>
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
              <Compass size={18} className="shrink-0 text-emerald-500" />
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
                <Sparkles size={18} className="text-indigo-500" /> {city} AI 추천 동선
              </h3>
              <button onClick={() => setAiCourse(null)} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            {aiCourse.length === 0 ? (
              <p className="px-5 py-12 text-center text-[13px] text-slate-400">
                추천 동선을 불러오지 못했어요. (실제 추천은 배포 환경에서 동작합니다)
              </p>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-5 py-2">
                  <div className="relative space-y-1 pl-4">
                    {/* vertical line */}
                    <span className="absolute bottom-2 left-[7px] top-2 w-px bg-slate-200" />
                    {aiCourse.map((stop, i) => (
                      <div key={`${stop.id}-${i}`} className="relative flex items-center gap-3 py-2">
                        <span className={`absolute -left-4 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${stop.meal ? "bg-amber-400" : "bg-indigo-500"}`} />
                        <span className="w-11 shrink-0 text-[12px] font-semibold tabular-nums text-slate-400">{pad2(stop.hour)}:00</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold text-slate-800">
                            {stop.meal && <span className="mr-1 text-amber-500">🍴</span>}
                            {stop.name}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">
                            {stop.slotLabel}
                            {stop.rating != null && ` · ⭐ ${stop.rating.toFixed(1)}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
                  <Button onClick={runAiRecommend} disabled={aiLoading} variant="outline" className="h-11 flex-1 rounded-xl border-slate-300 text-sm font-semibold">
                    다시 추천
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

// ── one slot's live search results (grid of cards, tap to add to course) ──
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

  return (
    <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3">
      {results.map((place) => {
        const isPicked = pickedIds.includes(place.id);
        return (
          <div
            key={place.id}
            className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${
              isPicked ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-200/70 hover:-translate-y-0.5 hover:shadow-lg"
            }`}
          >
            <button onClick={() => onOpenDetail(place)} className="block w-full text-left">
              <div className="relative flex h-24 items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-500">
                {place.photoName ? (
                  // eslint-disable-next-line @next/next/no-img-element -- /api/places/photo proxy
                  <img src={`/api/places/photo?name=${encodeURIComponent(place.photoName)}&w=400`} alt={place.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <MapPin size={22} className="text-white/90" />
                )}
              </div>
            </button>
            <div className="px-3 pb-3 pt-2.5">
              <p className="truncate text-[13px] font-bold text-slate-900">{place.name}</p>
              {place.rating != null && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                  <Star size={10} className="fill-amber-400 text-amber-400" />
                  {place.rating.toFixed(1)}
                  {place.reviewCount != null && <span className="font-normal text-slate-400">· {place.reviewCount.toLocaleString()}</span>}
                </p>
              )}
              <button
                onClick={() => onToggle(place)}
                className={`mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-lg text-[12px] font-semibold transition-colors ${
                  isPicked ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-slate-100 text-slate-600 hover:bg-indigo-500 hover:text-white"
                }`}
              >
                {isPicked ? <><Check size={13} /> 담김 · 빼기</> : <><Plus size={13} /> 코스에 담기</>}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
