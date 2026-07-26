"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { CommunityVisibilitySelector } from "@/components/CommunityVisibilitySelector";
import { COMMUNITY_CATEGORIES, type CommunityCategory, type CommunityVisibility } from "@/lib/community";
import { createCommunityPost, updateCommunityPost, uploadReviewPhotos, type CommunityPostDetail } from "@/lib/api";
import { resizeImageFiles } from "@/lib/imageResize";

const MAX_IMAGES = 5;

/** 커뮤니티 새 글 작성 / 기존 글 수정 — `existing`을 주면 수정 모드로 연다. */
export function CommunityPostComposer({
  defaultCategory,
  existing,
  onClose,
  onSaved,
}: {
  defaultCategory?: CommunityCategory;
  existing?: CommunityPostDetail | null;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [category, setCategory] = useState<CommunityCategory>(
    (existing?.category as CommunityCategory) ?? defaultCategory ?? COMMUNITY_CATEGORIES[0].slug,
  );
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [images, setImages] = useState<string[]>(existing?.images ?? []);
  const [visibility, setVisibility] = useState<CommunityVisibility>(existing?.visibility ?? "public");
  const [visibleToUserIds, setVisibleToUserIds] = useState<number[]>(existing?.visibleToUserIds ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const resized = await resizeImageFiles(Array.from(files).slice(0, MAX_IMAGES - images.length));
      const urls = await uploadReviewPhotos(resized);
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
      if (existing) {
        await updateCommunityPost(existing.id, { category, title: title.trim(), content: content.trim(), images, visibility, visibleToUserIds });
        onSaved(existing.id);
      } else {
        const { id } = await createCommunityPost({ category, title: title.trim(), content: content.trim(), images, visibility, visibleToUserIds });
        onSaved(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90%] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="truncate text-lg font-bold">{existing ? "글 수정" : "커뮤니티 글쓰기"}</h3>
          <button onClick={onClose} aria-label="닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {COMMUNITY_CATEGORIES.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setCategory(c.slug)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                category === c.slug ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="mb-3 w-full rounded-2xl border border-slate-200 px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-indigo-400"
        />

        <div className="mb-3 flex flex-wrap gap-2">
          {images.map((url) => (
            <div key={url} className="relative h-20 w-20 overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL */}
              <img src={url} alt="" className="h-full w-full object-cover" />
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
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <CordixIcon name="camera" size={18} />}
              <span className="text-[10px]">
                {images.length}/{MAX_IMAGES}
              </span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} disabled={uploading} />
            </label>
          )}
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="내용을 자유롭게 남겨보세요"
          rows={10}
          className="mb-4 min-h-[26vh] w-full resize-y rounded-2xl border border-slate-200 p-3 text-[13.5px] leading-relaxed outline-none focus:border-indigo-400"
        />

        <div className="mb-4">
          <p className="mb-2 text-[12.5px] font-semibold text-slate-600">공개 범위</p>
          <CommunityVisibilitySelector
            value={visibility}
            onChange={setVisibility}
            visibleToUserIds={visibleToUserIds}
            onVisibleToUserIdsChange={setVisibleToUserIds}
          />
        </div>

        {error && <p className="mb-3 text-center text-[12px] text-rose-500">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="h-12 w-full rounded-2xl bg-indigo-600 text-sm font-semibold text-white transition-opacity hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "저장 중…" : existing ? "수정 완료" : "글 등록"}
        </button>
      </div>
    </div>
  );
}
