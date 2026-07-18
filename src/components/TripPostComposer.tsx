"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Plus, Hash } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { Switch } from "@/components/ui/switch";
import type { SavedPlan, Region } from "@/lib/types";
import { fetchMyReviews, fetchMyTripPost, fetchTripPost, saveTripPost, searchPlaces, uploadReviewPhotos, type Review } from "@/lib/api";
import { PlaceReviewEditSheet, type PlaceStub } from "@/components/PlaceReviewEditSheet";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { hashtagSlug } from "@/lib/hashtag";
import { resizeImageFiles } from "@/lib/imageResize";

const MAX_IMAGES = 10;
const SEARCH_DEBOUNCE_MS = 400;

/** Unique places from a trip's schedule, in visiting order. */
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

// 여행 보관함에서 여는 전체 여행 후기 작성 — 블로그/인스타그램형으로
// 제목 + 본문 + 사진 갤러리를 자유롭게 쓴다. `plan`이 있으면 그 계획에
// 담긴 장소들을 "다녀온 장소"로 자동으로 가져오고, 없거나(완전 새로
// 작성) 부족하면 검색으로 장소를 더 추가할 수 있다 — 계획에 없던 곳도
// 후기에 남길 수 있어야 하므로. 이미 남긴 장소별 별점/코멘트가 있으면
// 다시 입력할 필요 없이 그대로 붙는다.
export function TripPostComposer({
  plan,
  itineraryId,
  postId: initialPostId,
  onClose,
}: {
  plan: SavedPlan | null;
  itineraryId: number | null;
  /**
   * Opens directly editing this specific post (e.g. from its own
   * /trip/[id] page's "수정하기") instead of looking one up by
   * itineraryId — the only way to reach a plan-less post, which has no
   * itineraryId to search by.
   */
  postId?: number;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [extraPlaces, setExtraPlaces] = useState<PlaceStub[]>([]);
  const [postId, setPostId] = useState<number | null>(initialPostId ?? null);
  const [resolvedItineraryId, setResolvedItineraryId] = useState<number | null>(itineraryId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [activePlace, setActivePlace] = useState<PlaceStub | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const planPlaces = useMemo(() => (plan ? uniquePlaces(plan) : []), [plan]);
  const places = useMemo(() => {
    const seen = new Set(planPlaces.map((p) => p.placeId));
    return [...planPlaces, ...extraPlaces.filter((p) => !seen.has(p.placeId))];
  }, [planPlaces, extraPlaces]);

  useEffect(() => {
    let cancelled = false;

    // Adds any reviewed places that aren't already part of the linked
    // plan's own schedule as chips, so ad-hoc places tagged in an earlier
    // save reappear on reopen instead of silently vanishing from the list.
    const applyExtraPlacesFromReviews = (reviewList: { placeId: string; placeName: string }[]) => {
      const known = new Set(planPlaces.map((p) => p.placeId));
      setExtraPlaces(
        reviewList.filter((r) => !known.has(r.placeId)).map((r) => ({ placeId: r.placeId, name: r.placeName })),
      );
    };

    if (initialPostId) {
      // The only entry point that can reach a plan-less post: itineraryId
      // is null for it, so fetchMyTripPost(itineraryId) is a permanent
      // no-op — we must look the post up directly by its own id instead.
      fetchTripPost(initialPostId).then((data) => {
        if (cancelled || !data) {
          setLoading(false);
          return;
        }
        const { post, placeReviews } = data;
        setResolvedItineraryId(post.itineraryId);
        setPostId(post.id);
        setTitle(post.title);
        setContent(post.content);
        setImages(post.images);
        setIsPublic(post.isPublic);
        setReviews(
          Object.fromEntries(
            placeReviews.map((r) => [
              r.placeId,
              { ...r, id: 0, itineraryId: post.itineraryId, isPublic: false, createdAt: "", updatedAt: "" },
            ]),
          ),
        );
        applyExtraPlacesFromReviews(placeReviews);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.all([
      fetchMyReviews(itineraryId ?? undefined),
      itineraryId ? fetchMyTripPost(itineraryId) : Promise.resolve(null),
    ]).then(([allReviews, post]) => {
      if (cancelled) return;
      // fetchMyReviews() with no itineraryId returns every review the user
      // has ever written, across every plan — for a plan-less compose
      // (itineraryId null) that must be narrowed to this user's own
      // plan-less reviews, or a fresh "완전 새로 작성" post would come in
      // pre-filled with unrelated places from a completely different trip.
      const reviewList = itineraryId == null ? allReviews.filter((r) => r.itineraryId == null) : allReviews;
      setReviews(Object.fromEntries(reviewList.map((r) => [r.placeId, r])));
      applyExtraPlacesFromReviews(reviewList);
      if (post) {
        setPostId(post.id);
        setTitle(post.title);
        setContent(post.content);
        setImages(post.images);
        setIsPublic(post.isPublic);
      } else if (plan) {
        setTitle(plan.name);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only load once per open, not on every plan/itineraryId/planPlaces identity change
  }, [itineraryId, initialPostId]);

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

  const insertHashtag = (place: PlaceStub) => {
    const tag = `#${hashtagSlug(place.name)} `;
    const el = contentRef.current;
    if (!el) {
      setContent((prev) => (prev ? `${prev} ${tag}` : tag));
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + tag + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + tag.length;
    });
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setError("제목과 내용을 입력해주세요");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { id } = await saveTripPost({
        id: postId ?? undefined,
        itineraryId: resolvedItineraryId ?? undefined,
        title: title.trim(),
        content: content.trim(),
        images,
        isPublic,
      });
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
                  <button type="button" onClick={() => setLightboxIndex(i)} className="block h-full w-full" aria-label="사진 크게 보기">
                    {/* eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                  {i === 0 && (
                    <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">대표</span>
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
                  {uploading ? <Loader2 size={18} className="animate-spin" /> : <CordixIcon name="camera" size={18} />}
                  <span className="text-[10px]">{images.length}/{MAX_IMAGES}</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} disabled={uploading} />
                </label>
              )}
            </div>

            <textarea
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="이번 여행은 어땠나요? 자유롭게 남겨보세요. #장소이름 을 붙이면 그 장소 후기와 연결돼요"
              rows={12}
              className="mb-2 min-h-[30vh] w-full resize-y rounded-2xl border border-slate-200 p-3 text-[13.5px] leading-relaxed outline-none focus:border-indigo-400"
            />

            {places.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {places.map((p) => (
                  <button
                    key={p.placeId}
                    onClick={() => insertHashtag(p)}
                    className="flex items-center gap-0.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                  >
                    <Hash size={10} /> {hashtagSlug(p.name)}
                  </button>
                ))}
              </div>
            )}

            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[12.5px] font-semibold text-slate-600">다녀온 장소 {places.length > 0 && `(${places.length})`}</p>
                <button
                  onClick={() => setSearchOpen((v) => !v)}
                  className="flex items-center gap-1 text-[12px] font-semibold text-indigo-500 hover:text-indigo-700"
                >
                  <Plus size={13} /> 장소 추가
                </button>
              </div>

              {searchOpen && (
                <PlaceSearchBox
                  defaultRegion={plan?.region ?? "international"}
                  excludeIds={new Set(places.map((p) => p.placeId))}
                  onAdd={(place) => {
                    setExtraPlaces((prev) => [...prev, place]);
                    setSearchOpen(false);
                  }}
                />
              )}

              {places.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-3 text-center text-[12.5px] text-slate-400">
                  아직 담긴 장소가 없어요 — 검색해서 추가해보세요
                </p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {places.map((p) => {
                    const existing = reviews[p.placeId];
                    const isExtra = extraPlaces.some((e) => e.placeId === p.placeId);
                    return (
                      <div key={p.placeId} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12.5px]">
                        <button onClick={() => setActivePlace(p)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{p.name}</span>
                          {existing ? (
                            <span className="flex shrink-0 items-center gap-0.5 font-semibold text-amber-500">
                              <CordixIcon name="star" size={11} stroke="#fbbf24" accent="#fbbf24" /> {existing.rating.toFixed(1)}
                            </span>
                          ) : (
                            <span className="shrink-0 text-slate-400">작성하기</span>
                          )}
                        </button>
                        {isExtra && (
                          <button
                            onClick={() => setExtraPlaces((prev) => prev.filter((e) => e.placeId !== p.placeId))}
                            aria-label={`${p.name} 제거`}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-slate-200 hover:text-slate-500"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

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

      {activePlace && (
        <PlaceReviewEditSheet
          itineraryId={resolvedItineraryId}
          place={activePlace}
          existing={reviews[activePlace.placeId]}
          onClose={() => setActivePlace(null)}
          onSaved={(review) => {
            setReviews((prev) => ({ ...prev, [review.placeId]: review }));
            setActivePlace(null);
          }}
        />
      )}

      {lightboxIndex != null && (
        <PhotoLightbox images={images} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
      )}
    </div>
  );
}

/** Inline search box for adding a place to a 여행 후기 beyond whatever a linked plan already had — same /api/places/search backend the planner's own search box uses. */
function PlaceSearchBox({
  defaultRegion,
  excludeIds,
  onAdd,
}: {
  defaultRegion: Region;
  excludeIds: Set<string>;
  onAdd: (place: PlaceStub) => void;
}) {
  const [region, setRegion] = useState<Region>(defaultRegion);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceStub[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedQuery = query.trim();
  const visibleResults = trimmedQuery ? results : [];

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!trimmedQuery) return;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const places = await searchPlaces(region, trimmedQuery);
        setResults(places.filter((p) => !excludeIds.has(p.id)).map((p) => ({ placeId: p.id, name: p.name })));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- excludeIds identity changes every render; only query/region should re-trigger the search
  }, [trimmedQuery, region]);

  return (
    <div className="mb-3 rounded-2xl border border-slate-200 p-2.5">
      <div className="mb-2 flex gap-1.5">
        {(["domestic", "international"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              region === r ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            {r === "domestic" ? "국내" : "해외"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
        <CordixIcon name="search" size={14} className="shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="장소 검색"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
        {loading && <Loader2 size={13} className="shrink-0 animate-spin text-slate-400" />}
      </div>
      {visibleResults.length > 0 && (
        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {visibleResults.map((p) => (
            <button
              key={p.placeId}
              onClick={() => onAdd(p)}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12.5px] hover:bg-indigo-50"
            >
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <Plus size={13} className="shrink-0 text-indigo-500" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
