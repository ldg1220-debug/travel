"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Rss, Loader2 } from "lucide-react";
import { fetchFeed, type FeedReview } from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";

/** Public feed of everyone's published 후기 (여행 보관함 → 후기 작성 → 피드에 공개하기) — browsable without logging in, same as /discover. */
export default function FeedPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchFeed(1).then((data) => {
      setReviews(data.reviews);
      setHasMore(data.pagination.hasMore);
      setPage(1);
      setLoading(false);
    });
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    const next = page + 1;
    const data = await fetchFeed(next);
    setReviews((prev) => [...prev, ...data.reviews]);
    setHasMore(data.pagination.hasMore);
    setPage(next);
    setLoadingMore(false);
  };

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <div className="mb-6 flex items-center gap-2">
          <Rss size={20} className="text-indigo-500" />
          <h2 className="text-2xl font-bold tracking-tight">후기 피드</h2>
        </div>

        {loading ? (
          <div className="py-24 text-center text-[13px] text-slate-400">불러오는 중…</div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Rss size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-700">아직 공개된 후기가 없어요</p>
            <p className="mt-1 text-[13px] text-slate-400">여행 보관함에서 첫 후기를 남겨보세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {reviews.map((r) => (
              <button
                key={r.id}
                onClick={() => router.push(`/review/${r.id}`)}
                className="group overflow-hidden rounded-2xl border border-slate-200/70 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative aspect-square bg-slate-100">
                  {r.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
                    <img src={r.images[0]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300">
                      <Star size={22} />
                    </div>
                  )}
                  <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                    <Star size={9} className="fill-amber-400 text-amber-400" /> {r.rating.toFixed(1)}
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-[12px] font-bold text-slate-900">{r.placeName}</p>
                  <p className="mt-0.5 truncate text-[10.5px] text-slate-400">
                    {r.authorName ?? "여행자"} · {formatDateLabel(r.createdAt.slice(0, 10))}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingMore && <Loader2 size={13} className="animate-spin" />} 더 보기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
