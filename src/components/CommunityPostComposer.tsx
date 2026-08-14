"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { CommunityVisibilitySelector } from "@/components/CommunityVisibilitySelector";
import { COMMUNITY_CATEGORIES, normalizeCommunityCategory, type CommunityCategory, type CommunityVisibility } from "@/lib/community";
import { createCommunityPost, updateCommunityPost, uploadReviewPhotos, type CommunityPostDetail } from "@/lib/api";
import { resizeImageFiles } from "@/lib/imageResize";

const MAX_IMAGES = 5;
const AUTOSAVE_INTERVAL_MS = 10 * 60 * 1000;

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
    existing?.category ? normalizeCommunityCategory(existing.category) : (defaultCategory ?? COMMUNITY_CATEGORIES[0].slug),
  );
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [images, setImages] = useState<string[]>(existing?.images ?? []);
  const [visibility, setVisibility] = useState<CommunityVisibility>(existing?.visibility ?? "public");
  const [visibleToUserIds, setVisibleToUserIds] = useState<number[]>(existing?.visibleToUserIds ?? []);
  // 새 글을 쓰는 도중 자동저장이 처음 성공하면 그때 생긴 글 id를 여기 담아,
  // 그 다음부터는 매번 새 글을 만들지 않고 이 글을 계속 업데이트한다.
  const [draftId, setDraftId] = useState<number | null>(existing?.id ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSaved, setAutoSaved] = useState(false);
  // 10분마다 자동으로 임시저장 — 여행 후기 작성(TripPostComposer)과 같은 안전망.
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const autoSaveRef = useRef<() => void>(() => {});

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

  // 자동저장이 "실제로 바뀐 게 있을 때만" 동작하도록 비교할 스냅샷.
  const buildSnapshot = () => JSON.stringify({ category, title, content, images, visibility, visibleToUserIds });

  // TripPostComposer와 같은 이유로 ref를 매 렌더마다 최신 클로저로 갱신한다
  // — 아래 마운트 시점 useEffect가 만드는 setInterval은 딱 한 번만 만들고
  // 다시 만들지 않으므로, 실행 시점엔 항상 최신 입력값을 봐야 한다.
  useEffect(() => {
    autoSaveRef.current = async () => {
      if (saving) return;
      if (!title.trim() || !content.trim()) return; // 수동 저장과 달리 에러 표시 없이 조용히 건너뜀
      const snapshot = buildSnapshot();
      if (snapshot === lastSavedSnapshotRef.current) return; // 마지막 저장 이후 바뀐 게 없으면 스킵
      try {
        if (draftId != null) {
          await updateCommunityPost(draftId, { category, title: title.trim(), content: content.trim(), images, visibility, visibleToUserIds });
        } else {
          const { id } = await createCommunityPost({ category, title: title.trim(), content: content.trim(), images, visibility, visibleToUserIds });
          setDraftId(id);
        }
        lastSavedSnapshotRef.current = snapshot;
        setAutoSaved(true);
        setTimeout(() => setAutoSaved(false), 2000);
      } catch {
        // 자동저장 실패는 조용히 넘어간다 — 저장 버튼은 여전히 쓸 수 있고, 10분 뒤 다시 시도된다.
      }
    };
  });

  useEffect(() => {
    lastSavedSnapshotRef.current = buildSnapshot();
    const id = setInterval(() => {
      void autoSaveRef.current();
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 한 번만 인터벌을 만든다 — 최신 로직은 autoSaveRef로 참조한다.
  }, []);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setError("제목과 내용을 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (draftId != null) {
        await updateCommunityPost(draftId, { category, title: title.trim(), content: content.trim(), images, visibility, visibleToUserIds });
        lastSavedSnapshotRef.current = buildSnapshot();
        onSaved(draftId);
      } else {
        const { id } = await createCommunityPost({ category, title: title.trim(), content: content.trim(), images, visibility, visibleToUserIds });
        setDraftId(id);
        lastSavedSnapshotRef.current = buildSnapshot();
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
          className="mb-3 w-full rounded-2xl border border-slate-200 px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-brand-500"
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
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500">
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
          className="mb-4 min-h-[26vh] w-full resize-y rounded-2xl border border-slate-200 p-3 text-[13.5px] leading-relaxed outline-none focus:border-brand-500"
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
        {autoSaved && <p className="mb-3 text-center text-[12px] text-success-500">임시 저장됐어요</p>}

        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="h-12 w-full rounded-2xl bg-brand-700 text-sm font-semibold text-white transition-opacity hover:bg-brand-800 disabled:opacity-60"
        >
          {saving ? "저장 중…" : existing ? "수정 완료" : "글 등록"}
        </button>
      </div>
    </div>
  );
}
