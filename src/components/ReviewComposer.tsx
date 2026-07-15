"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Check } from "lucide-react";
import type { SavedPlan } from "@/lib/types";
import { fetchMyReviews, type Review } from "@/lib/api";
import { PlaceReviewEditSheet, type PlaceStub } from "@/components/PlaceReviewEditSheet";

/** Unique places from a trip's schedule, in visiting order (dedupes a stop that appears more than once, e.g. lunch + evening drinks at the same spot). */
function uniquePlaces(plan: SavedPlan): PlaceStub[] {
  const ordered = [...plan.items].sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
  const seen = new Set<string>();
  const out: PlaceStub[] = [];
  for (const item of ordered) {
    if (seen.has(item.placeId)) continue;
    seen.add(item.placeId);
    out.push({ placeId: item.placeId, name: item.name });
  }
  return out;
}

// 여행 보관함의 계획 카드에서 열리는 후기 작성 플로우 — 트립에 담겼던
// 장소를 하나씩 골라 평점·짧은 코멘트·사진을 남긴다. `itineraryId`는
// 호출자가 이미 서버 동기화를 마쳐 얻은 실제 서버 행 id여야 한다
// (reviews 테이블이 itineraries를 참조하므로).
export function ReviewComposer({ plan, itineraryId, onClose }: { plan: SavedPlan; itineraryId: number; onClose: () => void }) {
  const places = useMemo(() => uniquePlaces(plan), [plan]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [loading, setLoading] = useState(true);
  const [activePlace, setActivePlace] = useState<PlaceStub | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyReviews(itineraryId).then((list) => {
      if (cancelled) return;
      setReviews(Object.fromEntries(list.map((r) => [r.placeId, r])));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [itineraryId]);

  const handleSaved = (review: Review) => {
    setReviews((prev) => ({ ...prev, [review.placeId]: review }));
    setActivePlace(null);
  };

  const writtenCount = places.filter((p) => reviews[p.placeId]).length;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85%] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between px-5 pb-1 pt-5">
          <h3 className="truncate text-lg font-bold">{plan.name} 장소 후기</h3>
          <button onClick={onClose} aria-label="닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        <p className="px-5 pb-3 text-[12.5px] text-slate-500">
          다녀온 장소를 눌러 후기를 남겨보세요 {places.length > 0 && `· ${writtenCount}/${places.length}개 작성`}
        </p>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading ? (
            <div className="py-16 text-center text-[13px] text-slate-400">불러오는 중…</div>
          ) : places.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-slate-400">이 계획에는 담긴 장소가 없어요</div>
          ) : (
            <div className="space-y-2">
              {places.map((p) => {
                const existing = reviews[p.placeId];
                return (
                  <button
                    key={p.placeId}
                    onClick={() => setActivePlace(p)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-slate-800">{p.name}</span>
                    {existing ? (
                      <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-emerald-600">
                        <Check size={13} /> {existing.rating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[12px] text-slate-400">작성하기</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {activePlace && (
        <PlaceReviewEditSheet
          itineraryId={itineraryId}
          place={activePlace}
          existing={reviews[activePlace.placeId]}
          onClose={() => setActivePlace(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
