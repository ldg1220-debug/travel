"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, MapPin, Star, Check, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MapProvider } from "@/app/(app)/planner/MapProvider";
import { PlaceDetailOverlay } from "@/app/(app)/planner/PlaceDetailOverlay";
import { useItineraryStore } from "@/store/itineraryStore";
import { fetchLivePlaceSearch } from "@/lib/api";
import { COURSE_SLOTS, regionsForScope, type CourseSlot } from "@/lib/courseRegions";
import { todayISODate, pad2 } from "@/lib/timeline";
import type { DiscoverScope } from "@/lib/discoverData";
import type { Place } from "@/lib/types";

type Step = "scope" | "region" | "city" | "build";

export default function CourseBuilderPage() {
  const router = useRouter();
  const addPlaces = useItineraryStore((s) => s.addPlaces);
  const addItem = useItineraryStore((s) => s.addItem);
  const setCurrentCity = useItineraryStore((s) => s.setCurrentCity);

  const [step, setStep] = useState<Step>("scope");
  const [scope, setScope] = useState<DiscoverScope>("domestic");
  const [region, setRegion] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  // slot key -> chosen place
  const [picks, setPicks] = useState<Record<string, Place>>({});
  const [activeSlot, setActiveSlot] = useState<string>(COURSE_SLOTS[0].key);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const regions = regionsForScope(scope);
  const regionGroup = regions.find((r) => r.label === region) ?? null;

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  };

  const reset = (toStep: Step) => {
    if (toStep === "scope") { setRegion(null); setCity(null); setPicks({}); }
    if (toStep === "region") { setCity(null); setPicks({}); }
    if (toStep === "city") { setPicks({}); setActiveSlot(COURSE_SLOTS[0].key); }
    setStep(toStep);
  };

  const pickedCount = Object.keys(picks).length;

  const buildItinerary = () => {
    const chosen = COURSE_SLOTS.map((s) => ({ slot: s, place: picks[s.key] })).filter((x): x is { slot: CourseSlot; place: Place } => Boolean(x.place));
    if (chosen.length === 0) return;
    const date = todayISODate();
    addPlaces(chosen.map((c) => c.place));
    chosen.forEach(({ slot, place }) => {
      addItem({
        placeId: place.id,
        name: place.name,
        date,
        time: `${pad2(slot.hour)}:00`,
        coordinates: { lat: place.lat, lng: place.lng },
      });
    });
    if (city) setCurrentCity(city);
    router.push("/planner");
  };

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:px-6">
        {/* header */}
        <div className="mb-6 flex items-center gap-3">
          {step !== "scope" && (
            <button
              onClick={() => reset(step === "region" ? "scope" : step === "city" ? "region" : "city")}
              aria-label="뒤로"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <ChevronLeft size={17} />
            </button>
          )}
          <div>
            <h1 className="flex items-center gap-1.5 text-2xl font-bold tracking-tight">
              <Sparkles size={22} className="text-indigo-500" /> 추천 코스 만들기
            </h1>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {step === "scope" && "국내 여행부터 시작해볼까요?"}
              {step === "region" && `${scope === "domestic" ? "어느 지역" : "어느 나라"}으로 떠나시나요?`}
              {step === "city" && `${region} 안에서 도시를 골라주세요`}
              {step === "build" && `${city} 코스를 카테고리별로 채워보세요`}
            </p>
          </div>
        </div>

        {/* breadcrumb */}
        {(region || city) && (
          <div className="mb-5 flex flex-wrap items-center gap-1.5 text-[12px]">
            {region && (
              <button onClick={() => reset("city")} className="rounded-full bg-indigo-600 px-3 py-1 font-semibold text-white">
                {region}
              </button>
            )}
            {city && (
              <button onClick={() => reset("build")} className="rounded-full bg-indigo-600 px-3 py-1 font-semibold text-white">
                {city}
              </button>
            )}
          </div>
        )}

        {/* ── STEP: scope ── */}
        {step === "scope" && (
          <div className="grid grid-cols-2 gap-4">
            {([
              { key: "domestic" as const, label: "국내 여행", flag: "🇰🇷", desc: "카카오맵 기준 실제 장소" },
              { key: "overseas" as const, label: "해외 여행", flag: "🌐", desc: "구글맵 기준 실제 장소·평점" },
            ]).map((s) => (
              <button
                key={s.key}
                onClick={() => { setScope(s.key); setStep("region"); }}
                className="flex flex-col items-start gap-2 rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span className="text-4xl">{s.flag}</span>
                <span className="text-lg font-bold">{s.label}</span>
                <span className="text-[12px] text-slate-500">{s.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── STEP: region (시·도 / 국가) ── */}
        {step === "region" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {regions.map((r) => (
              <button
                key={r.label}
                onClick={() => { setRegion(r.label); setStep("city"); }}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
              >
                <span className="text-2xl">{r.emoji}</span>
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* ── STEP: city ── */}
        {step === "city" && regionGroup && (
          <div className="flex flex-wrap gap-2.5">
            {regionGroup.cities.map((c) => (
              <button
                key={c}
                onClick={() => { setCity(c); setStep("build"); }}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-[14px] font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* ── STEP: build course ── */}
        {step === "build" && city && (
          <div>
            {/* slot tabs with pick status */}
            <div className="flex flex-wrap gap-2">
              {COURSE_SLOTS.map((s) => {
                const picked = picks[s.key];
                const active = activeSlot === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setActiveSlot(s.key)}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      active ? "border-slate-900 bg-slate-900 text-white" : picked ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <span>{s.emoji}</span>
                    {s.label}
                    {picked && <Check size={13} className={active ? "text-white" : "text-emerald-600"} />}
                  </button>
                );
              })}
            </div>

            <SlotResults
              scope={scope}
              city={city}
              slot={COURSE_SLOTS.find((s) => s.key === activeSlot)!}
              picked={picks[activeSlot] ?? null}
              onPick={(place) => {
                setPicks((prev) => ({ ...prev, [activeSlot]: place }));
                showToast(`${place.name} 코스에 담음`);
                // auto-advance to the next unfilled slot
                const idx = COURSE_SLOTS.findIndex((s) => s.key === activeSlot);
                const nextUnfilled = COURSE_SLOTS.slice(idx + 1).find((s) => !picks[s.key]);
                if (nextUnfilled) setActiveSlot(nextUnfilled.key);
              }}
              onOpenDetail={setDetailPlace}
            />

            {/* running course summary */}
            {pickedCount > 0 && (
              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-[13px] font-bold text-slate-700">내 코스 ({pickedCount})</p>
                <div className="space-y-2">
                  {COURSE_SLOTS.filter((s) => picks[s.key]).map((s) => {
                    const p = picks[s.key];
                    return (
                      <div key={s.key} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2">
                        <span className="text-[13px] tabular-nums text-slate-400">{pad2(s.hour)}:00</span>
                        <span className="text-base">{s.emoji}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">{p.name}</span>
                        <button
                          onClick={() => setPicks((prev) => { const n = { ...prev }; delete n[s.key]; return n; })}
                          aria-label={`${p.name} 코스에서 빼기`}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}
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
            <Button onClick={buildItinerary} className="ml-auto h-12 rounded-2xl bg-indigo-600 px-6 text-sm font-semibold hover:bg-indigo-700">
              이 코스로 일정 만들기
            </Button>
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
  picked,
  onPick,
  onOpenDetail,
}: {
  scope: DiscoverScope;
  city: string;
  slot: CourseSlot;
  picked: Place | null;
  onPick: (place: Place) => void;
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
        const isPicked = picked?.id === place.id;
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
                onClick={() => onPick(place)}
                className={`mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-lg text-[12px] font-semibold transition-colors ${
                  isPicked ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-indigo-500 hover:text-white"
                }`}
              >
                {isPicked ? <><Check size={13} /> 선택됨</> : <><Plus size={13} /> 코스에 담기</>}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
