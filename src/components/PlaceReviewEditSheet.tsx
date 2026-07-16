"use client";

import { useState } from "react";
import { X, Star, Camera, Loader2 } from "lucide-react";
import { saveReview, uploadReviewPhotos, type Review } from "@/lib/api";
import { resizeImageFile } from "@/lib/imageResize";

export interface PlaceStub {
  placeId: string;
  name: string;
}

// A place's quick rating+comment sheet — shared by ReviewComposer's
// standalone 장소 후기 flow and TripPostComposer's inline "장소 추가"
// (writing a trip post shouldn't require a separate trip to the 장소 후기
// sheet just to rate a place you're already tagging there). One rating per
// (user, trip, place) — `itineraryId` null means it's not tied to any
// saved plan (여행 후기 "완전 새로 작성" with places added ad-hoc).
export function PlaceReviewEditSheet({
  itineraryId,
  place,
  existing,
  onClose,
  onSaved,
}: {
  itineraryId: number | null;
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
      const [url] = await uploadReviewPhotos([await resizeImageFile(file)]);
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
      // 장소별 후기는 여행 전체 후기에 자동으로 묶여서 노출되므로 여기
      // 자체엔 별도 공개 여부가 없다 — 공개 여부는 전체 후기 쪽에서만 정한다.
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
