"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Link as LinkIcon, ChevronLeft } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import {
  deleteTripPost,
  fetchFollowStatus,
  fetchTripPost,
  followUser,
  saveTripPost,
  unfollowUser,
  type FollowStatus,
  type TripPostDetail,
  type TripPostPlaceReview,
  type Visibility,
} from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";
import { shareToKakao } from "@/lib/kakaoShare";
import { hashtagSlug } from "@/lib/hashtag";
import { VisibilitySelector } from "@/components/VisibilitySelector";
import { LoginModal } from "@/components/LoginModal";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { TripPostComposer } from "@/components/TripPostComposer";

/** Standalone public view of one 여행 후기 (blog/Instagram-style trip post) — what a 카카오톡 공유 link or "링크 복사" opens for anyone, logged in or not, if the post was published to the feed (or you're its author). */
export default function TripPostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [post, setPost] = useState<TripPostDetail | null>(null);
  const [placeReviews, setPlaceReviews] = useState<TripPostPlaceReview[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [followStatus, setFollowStatus] = useState<FollowStatus | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

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

  // "누가 · 어떤 여행 · 언제" 요약 한 줄 — 본문 아래 표기와 카카오톡 공유
  // 미리보기(description) 양쪽에 그대로 쓴다. 예전엔 공유 카드에 본문을
  // 60자에서 그냥 잘라 넣었더니 문장이 어색하게 끊겼는데, 이 요약은
  // 후기마다 항상 같은 형태로 깔끔하게 끝난다.
  const metaLine = post
    ? [post.authorName ?? "여행자", post.tripTitle, formatDateLabel(post.createdAt.slice(0, 10))].filter(Boolean).join(" · ")
    : "";

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

  // 남의 후기를 볼 때만 팔로우 상태를 조회 — 팔로우 버튼과 "친구공개" 접근
  // 가능 여부 표시에 쓴다.
  useEffect(() => {
    if (!post || isOwner || !session?.user) return;
    let cancelled = false;
    fetchFollowStatus(post.authorId).then((next) => {
      if (!cancelled) setFollowStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [post, isOwner, session?.user]);

  const handleToggleFollow = async () => {
    if (!post) return;
    if (!session?.user) {
      setLoginOpen(true);
      return;
    }
    setFollowBusy(true);
    try {
      if (followStatus?.isFollowing) {
        await unfollowUser(post.authorId);
      } else {
        await followUser(post.authorId);
      }
      const next = await fetchFollowStatus(post.authorId);
      setFollowStatus(next);
    } finally {
      setFollowBusy(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  // 작성 시점의 공개 범위 선택과 별개로, 다 쓴 후에도 전체 편집 화면을
  // 다시 열지 않고 바로 공개 범위를 바꿀 수 있게 한다.
  const handleChangeVisibility = async (visibility: Visibility, visibleToUserIds: number[]) => {
    if (!post) return;
    setTogglingVisibility(true);
    try {
      await saveTripPost({
        id: post.id,
        title: post.title,
        content: post.content,
        images: post.images,
        visibility,
        visibleToUserIds,
      });
      setPost((prev) => (prev ? { ...prev, visibility, visibleToUserIds } : prev));
      showToast("공개 범위가 변경됐어요");
    } catch {
      showToast("변경에 실패했어요");
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    setDeleting(true);
    try {
      await deleteTripPost(post.id);
      router.push("/scrapbook");
    } catch {
      showToast("삭제에 실패했어요");
      setDeleting(false);
    }
  };

  const handleShare = async () => {
    if (!post) return;
    const url = `${window.location.origin}/trip/${post.id}`;
    try {
      await shareToKakao({ title: post.title, description: metaLine, url, imageUrl: post.images[0] });
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

        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-slate-400">{metaLine}</p>
          {!isOwner && (
            <button
              onClick={handleToggleFollow}
              disabled={followBusy}
              className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-60 ${
                followStatus?.isFollowing ? "border border-slate-200 bg-white text-slate-500" : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {followStatus?.isFollowing ? (followStatus.isFriend ? "친구" : "팔로잉") : "팔로우"}
            </button>
          )}
        </div>
        <h1 className="text-xl font-bold tracking-tight">{post.title}</h1>

        {isOwner && (
          <div className="mt-3 space-y-2">
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-slate-500">공개 범위</p>
              <VisibilitySelector
                value={post.visibility}
                onChange={(v) => handleChangeVisibility(v, post.visibleToUserIds)}
                visibleToUserIds={post.visibleToUserIds}
                onVisibleToUserIdsChange={(ids) => handleChangeVisibility(post.visibility, ids)}
              />
              {togglingVisibility && <p className="mt-1 text-[11px] text-slate-400">변경 중…</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditOpen(true)}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <CordixIcon name="pencil" size={14} /> 수정하기
              </button>
              {confirmingDelete ? (
                <>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex h-10 items-center justify-center rounded-2xl bg-rose-500 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-60"
                  >
                    {deleting ? "삭제 중…" : "삭제 확인"}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="후기 삭제"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                >
                  <CordixIcon name="trash" size={15} accent="currentColor" />
                </button>
              )}
            </div>
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
              <CordixIcon name="pin" size={14} className="text-indigo-500" /> 다녀온 장소
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
                        <CordixIcon name="star" size={10} stroke="#fbbf24" accent="#fbbf24" /> {r.rating.toFixed(1)}
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
            <CordixIcon name="share" size={15} /> 카카오톡 공유
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

      {loginOpen && <LoginModal reason="팔로우하려면 로그인해주세요." onClose={() => setLoginOpen(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// A "#장소이름" mention inside the free-form body — hovering (desktop) or
// tapping (mobile) it surfaces the author's short per-place review without
// leaving the post, instead of making readers scroll down to "다녀온 장소".
const POPOVER_WIDTH = 240; // w-60
const POPOVER_MARGIN = 8;

function HashtagMention({ review }: { review: TripPostPlaceReview }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  useEffect(() => {
    // The popover is centered on the tag by default (translateX(-50%)), but
    // near a screen edge that pushes half of it off-screen — clamp with a
    // pixel shift so it stays fully visible instead of getting clipped.
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const anchorCenter = rect.left + rect.width / 2;
    const halfWidth = POPOVER_WIDTH / 2;
    let next = 0;
    if (anchorCenter - halfWidth < POPOVER_MARGIN) {
      next = POPOVER_MARGIN - (anchorCenter - halfWidth);
    } else if (anchorCenter + halfWidth > window.innerWidth - POPOVER_MARGIN) {
      next = window.innerWidth - POPOVER_MARGIN - (anchorCenter + halfWidth);
    }
    setShift(next);
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
        <span
          className="absolute bottom-full left-1/2 z-20 mb-2 w-60 rounded-2xl border border-slate-200 bg-white p-3 text-left text-[13px] normal-case shadow-xl"
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
        >
          <span className="mb-1.5 flex items-center gap-2">
            {review.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
              <img src={review.images[0]} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-bold text-slate-800">{review.placeName}</span>
              <span className="flex items-center gap-0.5 text-[11px] font-semibold text-amber-500">
                <CordixIcon name="star" size={10} stroke="#fbbf24" accent="#fbbf24" /> {review.rating.toFixed(1)}
              </span>
            </span>
          </span>
          <span className="block text-[12px] leading-snug text-slate-600">{review.content}</span>
        </span>
      )}
    </span>
  );
}
