"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Star, Share2, Link as LinkIcon, ChevronLeft, MapPin, Globe, Lock, Pencil } from "lucide-react";
import { fetchTripPost, saveTripPost, type TripPostDetail, type TripPostPlaceReview } from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";
import { shareToKakao } from "@/lib/kakaoShare";
import { hashtagSlug } from "@/lib/hashtag";
import { Switch } from "@/components/ui/switch";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { TripPostComposer } from "@/components/TripPostComposer";

/** Standalone public view of one 여행 후기 (blog/Instagram-style trip post) — what a 카카오톡 공유 link or "링크 복사" opens for anyone, logged in or not, if the post was published to the feed (or you're its author). */
export default function TripPostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<TripPostDetail | null>(null);
  const [placeReviews, setPlaceReviews] = useState<TripPostPlaceReview[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const reload = () => {
    const id = Number(params.id);
    fetchTripPost(id).then((data) => {
      if (!data) return;
      setPost(data.post);
      setPlaceReviews(data.placeReviews);
      setIsOwner(data.isOwner);
    });
  };

  const reviewBySlug = useMemo(
    () => new Map(placeReviews.map((r) => [hashtagSlug(r.placeName).toLowerCase(), r])),
    [placeReviews],
  );

  useEffect(() => {
    const id = Number(params.id);
    fetchTripPost(id).then((data) => {
      if (!data) {
        setNotFound(true);
        return;
      }
      setPost(data.post);
      setPlaceReviews(data.placeReviews);
      setIsOwner(data.isOwner);
    });
  }, [params.id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  // 작성 시점의 "피드에 공개하기" 토글과 별개로, 다 쓴 후에도 전체 편집
  // 화면을 다시 열지 않고 바로 공개/비공개를 뒤집을 수 있게 한다.
  const handleToggleVisibility = async () => {
    if (!post) return;
    const nextIsPublic = !post.isPublic;
    setTogglingVisibility(true);
    try {
      await saveTripPost({
        id: post.id,
        title: post.title,
        content: post.content,
        images: post.images,
        isPublic: nextIsPublic,
      });
      setPost((prev) => (prev ? { ...prev, isPublic: nextIsPublic } : prev));
      showToast(nextIsPublic ? "피드에 공개됐어요" : "비공개로 전환했어요");
    } catch {
      showToast("변경에 실패했어요");
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleShare = async () => {
    if (!post) return;
    const url = `${window.location.origin}/trip/${post.id}`;
    try {
      await shareToKakao({ title: post.title, description: post.content.slice(0, 60), url, imageUrl: post.images[0] });
    } catch {
      showToast("카카오톡 공유에 실패했어요");
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/trip/${params.id}`;
    await navigator.clipboard.writeText(url);
    showToast("링크가 복사되었어요");
  };

  if (notFound) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-sm font-semibold text-slate-700">후기를 찾을 수 없어요</p>
        <p className="mt-1 text-[13px] text-slate-400">비공개 후기이거나 삭제되었을 수 있어요.</p>
      </div>
    );
  }

  if (!post) {
    return <div className="flex min-h-full items-center justify-center bg-slate-50 text-[13px] text-slate-400">불러오는 중…</div>;
  }

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-lg px-4 pb-24 pt-6 sm:px-6">
        <button
          onClick={() => router.back()}
          className="mb-4 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          aria-label="뒤로"
        >
          <ChevronLeft size={17} />
        </button>

        {post.images.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-1.5 overflow-hidden rounded-2xl">
            {post.images.slice(0, 4).map((url, i) => (
              <button
                key={url}
                onClick={() => setLightbox({ images: post.images, index: i })}
                aria-label="사진 크게 보기"
                className={post.images.length === 1 ? "col-span-2" : i === 0 && post.images.length === 3 ? "col-span-2" : ""}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL */}
                <img src={url} alt="" className="h-40 w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <p className="mb-1 text-[12.5px] text-slate-400">
          {post.authorName ?? "여행자"}
          {post.tripTitle && ` · ${post.tripTitle}`} · {formatDateLabel(post.createdAt.slice(0, 10))}
        </p>
        <h1 className="text-xl font-bold tracking-tight">{post.title}</h1>

        {isOwner && (
          <div className="mt-3 space-y-2">
            <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
                {post.isPublic ? <Globe size={14} className="text-emerald-500" /> : <Lock size={14} className="text-slate-400" />}
                {post.isPublic ? "피드에 공개 중" : "비공개 (나만 보기)"}
              </span>
              <Switch checked={post.isPublic} disabled={togglingVisibility} onCheckedChange={handleToggleVisibility} />
            </label>
            <button
              onClick={() => setEditOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white py-2.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Pencil size={14} /> 수정하기
            </button>
          </div>
        )}

        <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">
          {post.content.split(/(#\S+)/g).map((part, i) => {
            if (part.startsWith("#")) {
              const review = reviewBySlug.get(part.slice(1).toLowerCase());
              if (review) return <HashtagMention key={i} review={review} />;
            }
            return <Fragment key={i}>{part}</Fragment>;
          })}
        </p>

        {placeReviews.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-slate-700">
              <MapPin size={14} className="text-indigo-500" /> 다녀온 장소
            </p>
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              {placeReviews.map((r) => (
                <div key={r.placeId} className="flex items-start gap-2 border-b border-slate-50 pb-2 text-[13px] last:border-0 last:pb-0">
                  {r.images[0] && (
                    <button onClick={() => setLightbox({ images: r.images, index: 0 })} aria-label={`${r.placeName} 사진 크게 보기`} className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL */}
                      <img src={r.images[0]} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-800">{r.placeName}</span>
                      <span className="flex items-center gap-0.5 text-[11.5px] font-semibold text-amber-500">
                        <Star size={10} className="fill-amber-400 text-amber-400" /> {r.rating.toFixed(1)}
                      </span>
                    </p>
                    <p className="truncate text-[12px] text-slate-500">{r.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            onClick={handleShare}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#FEE500] text-[13px] font-semibold text-black/85 transition-opacity hover:opacity-90"
          >
            <Share2 size={15} /> 카카오톡 공유
          </button>
          <button
            onClick={handleCopyLink}
            className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <LinkIcon size={15} /> 링크 복사
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900/90 px-3.5 py-2 text-xs text-white">
          {toast}
        </div>
      )}

      {lightbox && (
        <PhotoLightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox((prev) => (prev ? { ...prev, index } : prev))}
        />
      )}

      {editOpen && (
        <TripPostComposer
          plan={null}
          itineraryId={null}
          postId={post.id}
          onClose={() => {
            setEditOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// A "#장소이름" mention inside the free-form body — hovering (desktop) or
// tapping (mobile) it surfaces the author's short per-place review without
// leaving the post, instead of making readers scroll down to "다녀온 장소".
function HashtagMention({ review }: { review: TripPostPlaceReview }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-semibold text-indigo-500 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-600"
      >
        #{hashtagSlug(review.placeName)}
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-20 mb-2 w-60 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-3 text-left text-[13px] normal-case shadow-xl">
          <span className="mb-1.5 flex items-center gap-2">
            {review.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
              <img src={review.images[0]} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-bold text-slate-800">{review.placeName}</span>
              <span className="flex items-center gap-0.5 text-[11px] font-semibold text-amber-500">
                <Star size={10} className="fill-amber-400 text-amber-400" /> {review.rating.toFixed(1)}
              </span>
            </span>
          </span>
          <span className="block text-[12px] leading-snug text-slate-600">{review.content}</span>
        </span>
      )}
    </span>
  );
}
