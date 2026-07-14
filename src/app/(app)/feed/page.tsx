"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Rss, Loader2 } from "lucide-react";
import { fetchFeed, type FeedPost } from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";

/** Public feed of everyone's published 여행 후기 (blog/Instagram-style trip posts) — browsable without logging in, same as /discover. */
export default function FeedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchFeed(1).then((data) => {
      setPosts(data.posts);
      setHasMore(data.pagination.hasMore);
      setPage(1);
      setLoading(false);
    });
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    const next = page + 1;
    const data = await fetchFeed(next);
    setPosts((prev) => [...prev, ...data.posts]);
    setHasMore(data.pagination.hasMore);
    setPage(next);
    setLoadingMore(false);
  };

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-lg px-4 pb-24 pt-8 sm:px-6">
        <div className="mb-6 flex items-center gap-2">
          <Rss size={20} className="text-indigo-500" />
          <h2 className="text-2xl font-bold tracking-tight">후기 피드</h2>
        </div>

        {loading ? (
          <div className="py-24 text-center text-[13px] text-slate-400">불러오는 중…</div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Rss size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-700">아직 공개된 후기가 없어요</p>
            <p className="mt-1 text-[13px] text-slate-400">여행 보관함에서 첫 여행 후기를 남겨보세요.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {posts.map((post) => (
              <button
                key={post.id}
                onClick={() => router.push(`/trip/${post.id}`)}
                className="group block w-full overflow-hidden rounded-3xl border border-slate-200/70 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                {post.images[0] && (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
                  <img src={post.images[0]} alt="" className="h-52 w-full object-cover" />
                )}
                <div className="px-4 py-4">
                  <p className="text-[11.5px] font-medium text-slate-400">
                    {post.authorName ?? "여행자"}
                    {post.tripTitle && ` · ${post.tripTitle}`} · {formatDateLabel(post.createdAt.slice(0, 10))}
                  </p>
                  <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">{post.title}</h3>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-slate-500">{post.content}</p>
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
