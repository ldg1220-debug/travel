"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, X } from "lucide-react";
import { useItineraryStore } from "@/store/itineraryStore";
import { PlaceGlyph } from "@/app/(app)/planner/icons";
import { CATEGORY_OPTIONS } from "@/app/(app)/planner/PlaceDetailOverlay";

// Saved places whose `category` isn't one of the 6 canonical values (e.g. a
// raw Google `primaryType` or Kakao category string that was never manually
// re-classified) fall into this catch-all filter bucket instead of vanishing
// from every specific tab.
const OTHER_CATEGORY = "__other__";
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));
const isKnownCategory = (category: string) => category in CATEGORY_LABEL;

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
//
// A fully independent tab from /scrapbook (다녀온 여행 보관함, past
// *trips*): this one lists `savedPlaces` — individual 관심 장소 saved
// from /planner's 관심 장소 탭 or /discover's card taps — with no
// itinerary/date attached at all.
export default function SavedPlacesPage() {
  const router = useRouter();
  const savedPlaces = useItineraryStore((s) => s.savedPlaces);
  const removeSavedPlace = useItineraryStore((s) => s.removeSavedPlace);
  const upsertSavedPlace = useItineraryStore((s) => s.upsertSavedPlace);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of savedPlaces) {
      const key = isKnownCategory(p.category) ? p.category : OTHER_CATEGORY;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [savedPlaces]);

  const visiblePlaces = useMemo(() => {
    if (categoryFilter === "all") return savedPlaces;
    if (categoryFilter === OTHER_CATEGORY) return savedPlaces.filter((p) => !isKnownCategory(p.category));
    return savedPlaces.filter((p) => p.category === categoryFilter);
  }, [savedPlaces, categoryFilter]);

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">관심 장소 보관함</h2>
          <p className="mt-1 text-[13px] text-slate-500">일정에 담기 전에 찜해둔 장소들이에요.</p>
        </div>

        {savedPlaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Heart size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-700">아직 저장한 장소가 없어요</p>
            <p className="mt-1 text-[13px] text-slate-400">탐색이나 계획 화면에서 마음에 드는 장소를 찜해보세요.</p>
          </div>
        ) : (
          <>
            {/* 분류 필터 — 저장할 때 붙은 카테고리로 걸러본다. 6개 표준
                분류에 안 걸리는(구글/카카오 원본 카테고리 그대로인) 곳은
                기타로 묶는다. */}
            <div className="mb-4 flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategoryFilter("all")}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  categoryFilter === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                전체 <span className="opacity-70">{savedPlaces.length}</span>
              </button>
              {CATEGORY_OPTIONS.map((c) => {
                const count = counts.get(c.value) ?? 0;
                if (count === 0) return null;
                const active = categoryFilter === c.value;
                return (
                  <button
                    key={c.value}
                    onClick={() => setCategoryFilter(c.value)}
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {c.label} <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
              {(counts.get(OTHER_CATEGORY) ?? 0) > 0 && (
                <button
                  onClick={() => setCategoryFilter(OTHER_CATEGORY)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    categoryFilter === OTHER_CATEGORY
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  기타 <span className="opacity-70">{counts.get(OTHER_CATEGORY)}</span>
                </button>
              )}
            </div>

            {visiblePlaces.length === 0 ? (
              <p className="py-16 text-center text-[13px] text-slate-400">이 분류에는 저장된 장소가 없어요.</p>
            ) : (
              <div className="space-y-2.5">
                {visiblePlaces.map((place) => (
                  <div
                    key={place.id}
                    onClick={() => router.push(`/planner?openDetail=${encodeURIComponent(place.id)}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: place.color }}
                    >
                      <PlaceGlyph icon={place.icon} size={18} color="white" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-slate-900">{place.name}</p>
                      <p className="truncate text-[12px] text-slate-500">{place.memo || place.address || place.category}</p>
                    </div>
                    {/* 분류 편집 — 목록에서 바로 카테고리를 바꿀 수 있게, 전체
                        상세 오버레이를 열지 않아도 되도록 한다. */}
                    <select
                      value={isKnownCategory(place.category) ? place.category : ""}
                      onChange={(e) => {
                        e.stopPropagation();
                        upsertSavedPlace({ ...place, category: e.target.value });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${place.name} 분류 변경`}
                      className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 outline-none"
                    >
                      <option value="" disabled>
                        분류 선택
                      </option>
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSavedPlace(place.id);
                      }}
                      aria-label={`${place.name} 저장 해제`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
