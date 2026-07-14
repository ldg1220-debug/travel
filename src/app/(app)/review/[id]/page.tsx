"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Star, Share2, Link as LinkIcon, ChevronLeft } from "lucide-react";
import { fetchReview, type ReviewDetail } from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";
import { shareToKakao } from "@/lib/kakaoShare";

/** Standalone public view of one 후기 — what a 카카오톡 공유 link or "링크 복사" opens for anyone, logged in or not (visible only if the review was published to the feed, or you're its author). */
export default function ReviewDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const id = Number(params.id);
    fetchReview(id).then((data) => {
      if (!data) {
        setNotFound(true);
        return;
      }
      setReview(data.review);
    });
  }, [params.id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  const handleShare = async () => {
    if (!review) return;
    const url = `${window.location.origin}/review/${review.id}`;
    try {
      await shareToKakao({
        title: `${review.placeName} 후기`,
        description: review.content.slice(0, 60),
        url,
        imageUrl: review.images[0],
      });
    } catch {
      showToast("카카오톡 공유에 실패했어요");
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/review/${params.id}`;
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

  if (!review) {
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

        {review.images.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-1.5 overflow-hidden rounded-2xl">
            {review.images.slice(0, 4).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
              <img key={url} src={url} alt="" className={`h-40 w-full object-cover ${review.images.length === 1 ? "col-span-2" : ""} ${i === 0 && review.images.length === 3 ? "col-span-2" : ""}`} />
            ))}
          </div>
        )}

        <div className="mb-1 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={16} className={n <= Math.round(review.rating) ? "fill-amber-400 text-amber-400" : "text-slate-200"} />
          ))}
          <span className="ml-1 text-[13px] font-semibold text-slate-600">{review.rating.toFixed(1)}</span>
        </div>

        <h1 className="text-xl font-bold tracking-tight">{review.placeName}</h1>
        <p className="mt-1 text-[12.5px] text-slate-400">
          {review.authorName ?? "여행자"}
          {review.tripTitle && ` · ${review.tripTitle}`} · {formatDateLabel(review.createdAt.slice(0, 10))}
        </p>

        <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">{review.content}</p>

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
    </div>
  );
}
