"use client";

import { useEffect, useState } from "react";
import { X, Star, Camera, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { SavedPlan } from "@/lib/types";
import { fetchMyReviews, fetchMyTripPost, saveTripPost, uploadReviewPhotos, type Review } from "@/lib/api";

const MAX_IMAGES = 10;

// 여행 보관함의 "다녀온 여행" 카드에서 열리는 전체 여행 후기 작성 —
// 블로그/인스타그램형으로 제목 + 본문 + 사진 갤러리를 자유롭게 쓰고, 이미
// 장소별로 남긴 별점·한줄평이 있으면 "다녀온 장소" 섹션으로 자동으로
// 붙여서 보여준다(별도로 다시 입력할 필요 없음).
export function TripPostComposer({ plan, itineraryId, onClose }: { plan: SavedPlan; itineraryId: number; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [placeReviews, setPlaceReviews] = useState<Review[]>([]);
  const [postId, setPostId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyReviews(itineraryId), fetchMyTripPost(itineraryId)]).then(([reviews, post]) => {
      if (cancelled) return;
      setPlaceReviews(reviews);
      if (post) {
        setPostId(post.id);
        setTitle(post.title);
        setContent(post.content);
        setImages(post.images);
        setIsPublic(post.isPublic);
      } else {
        setTitle(plan.name);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only load once per trip, not on every plan.name identity change
  }, [itineraryId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const urls = await uploadReviewPhotos(Array.from(files).slice(0, MAX_IMAGES - images.length));
      setImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했어요");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setError("제목과 내용을 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { id } = await saveTripPost({ itineraryId, title: title.trim(), content: content.trim(), images, isPublic });
      setPostId(id);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setError("저장에 실패했어요");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90%] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="truncate text-lg font-bold">여행 후기 쓰기</h3>
          <button onClick={onClose} aria-label="닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-[13px] text-slate-400">불러오는 중…</div>
        ) : (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목 (예: 벚꽃 가득했던 오사카 3박4일)"
              className="mb-3 w-full rounded-2xl border border-slate-200 px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-indigo-400"
            />

            <div className="mb-3 flex flex-wrap gap-2">
              {images.map((url, i) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">대표</span>
                  )}
                  <button
                    onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                    className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white"
                    aria-label="사진 삭제"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-slate-400 hover:border-indigo-300 hover:text-indigo-400">
                  {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                  <span className="text-[10px]">{images.length}/{MAX_IMAGES}</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} disabled={uploading} />
                </label>
              )}
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="이번 여행은 어땠나요? 자유롭게 남겨보세요"
              rows={8}
              className="mb-4 w-full resize-none rounded-2xl border border-slate-200 p-3 text-[13.5px] leading-relaxed outline-none focus:border-indigo-400"
            />

            {placeReviews.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[12.5px] font-semibold text-slate-600">다녀온 장소 ({placeReviews.length})</p>
                <div className="space-y-1.5 rounded-2xl bg-slate-50 p-3">
                  {placeReviews.map((r) => (
                    <div key={r.placeId} className="flex items-start gap-2 text-[12.5px]">
                      <span className="flex shrink-0 items-center gap-0.5 font-semibold text-amber-500">
                        <Star size={11} className="fill-amber-400 text-amber-400" /> {r.rating.toFixed(1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-700">{r.placeName}</span>
                        <span className="text-slate-500"> — {r.content}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
              <span className="text-[13px] font-medium text-slate-700">피드에 공개하기</span>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </label>

            {error && <p className="mb-3 text-center text-[12px] text-rose-500">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving || uploading}
              className="h-12 w-full rounded-2xl bg-indigo-600 text-sm font-semibold text-white transition-opacity hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "저장 중…" : saved ? "저장됨 ✓" : postId ? "수정 저장" : "여행 후기 저장"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
