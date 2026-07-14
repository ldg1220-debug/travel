"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Star, Camera, Loader2, Check } from "lucide-react";
import type { SavedPlan } from "@/lib/types";
import { fetchMyReviews, saveReview, uploadReviewPhotos, type Review } from "@/lib/api";

interface PlaceStub {
  placeId: string;
  name: string;
}

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

// 여행 보관함의 "다녀온 여행" 카드에서 열리는 후기 작성 플로우 — 트립에
// 담겼던 장소를 하나씩 골라 평점·글·사진을 남기고, 원하면 인앱 피드에도
// 공개할 수 있다. `itineraryId`는 호출자가 이미 서버 동기화를 마쳐 얻은
// 실제 서버 행 id여야 한다(reviews 테이블이 itineraries를 참조하므로).
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
        <ReviewEditSheet
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

function ReviewEditSheet({
  itineraryId,
  place,
  existing,
  onClose,
  onSaved,
}: {
  itineraryId: number;
  place: PlaceStub;
  existing?: Review;
  onClose: () => void;
  onSaved: (review: Review) => void;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [content, setContent] = useState(existing?.content ?? "");
  const [image, setImage] = useState<string | null>(existing?.images?.[0] ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const [url] = await uploadReviewPhotos([file]);
      setImage(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했어요");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      setError("한 줄 코멘트를 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const images = image ? [image] : [];
      // 장소별 후기는 여행 전체 후기(후기 작성 → 여행 후기)에 자동으로
      // 묶여서 노출되므로 여기 자체엔 별도 공개 여부가 없다 — 공개 여부는
      // 전체 후기 쪽에서만 정한다.
      const { id } = await saveReview({ itineraryId, placeId: place.placeId, placeName: place.name, rating, content: content.trim(), images, isPublic: false });
      onSaved({
        id,
        itineraryId,
        placeId: place.placeId,
        placeName: place.name,
        rating,
        content: content.trim(),
        images,
        isPublic: false,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      setError("저장에 실패했어요");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90%] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="truncate text-base font-bold">{place.name}</h3>
          <button onClick={onClose} aria-label="닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 flex items-center justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} aria-label={`${n}점`}>
              <Star size={28} className={n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-200"} />
            </button>
          ))}
        </div>

        <div className="mb-1 flex items-center gap-2">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 50))}
            placeholder="한 줄로 남겨보세요 (예: 야경이 정말 예뻤어요)"
            maxLength={50}
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-[13.5px] outline-none focus:border-indigo-400"
          />
          {image ? (
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL */}
              <img src={image} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => setImage(null)}
                className="absolute right-0 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/50 text-white"
                aria-label="사진 삭제"
              >
                <X size={9} />
              </button>
            </div>
          ) : (
            <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 hover:border-indigo-300 hover:text-indigo-400">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files)} disabled={uploading} />
            </label>
          )}
        </div>
        <p className="mb-4 text-right text-[11px] text-slate-400">{content.length}/50</p>

        {error && <p className="mb-3 text-center text-[12px] text-rose-500">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="h-12 w-full rounded-2xl bg-indigo-600 text-sm font-semibold text-white transition-opacity hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
