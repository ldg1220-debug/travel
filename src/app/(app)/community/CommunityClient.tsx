"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Search } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { fetchCommunityPosts, type CommunityPostSummary } from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";
import { COMMUNITY_CATEGORIES, communityCategoryLabel, isCommunityCategory } from "@/lib/community";
import { LoginModal } from "@/components/LoginModal";
import { CommunityPostComposer } from "@/components/CommunityPostComposer";
import { UserProfileSheet } from "@/components/UserProfileSheet";

const SEARCH_DEBOUNCE_MS = 400;

/** 커뮤니티 게시판 — 여행 후기(/feed)와 별개로, 카테고리별 자유 게시판. 비로그인도 둘러볼 순 있지만 글쓰기는 로그인한 회원만. */
export function CommunityPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [posts, setPosts] = useState<CommunityPostSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [loginOpen, setLoginOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetchCommunityPosts(1, 15, { category: category === "all" ? undefined : category, q: query }).then((data) => {
        setPosts(data.posts);
        setHasMore(data.pagination.hasMore);
        setPage(1);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, category]);

  const loadMore = async () => {
    setLoadingMore(true);
    const next = page + 1;
    const data = await fetchCommunityPosts(next, 15, { category: category === "all" ? undefined : category, q: query });
    setPosts((prev) => [...prev, ...data.posts]);
    setHasMore(data.pagination.hasMore);
    setPage(next);
    setLoadingMore(false);
  };

  const handleWrite = () => {
    if (!session?.user) {
      setLoginOpen(true);
      return;
    }
    setComposerOpen(true);
  };

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-lg px-4 pb-24 pt-8 sm:px-6 lg:max-w-3xl lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CordixIcon name="group" size={20} stroke="#6366f1" />
            <h2 className="text-2xl font-bold tracking-tight">커뮤니티</h2>
          </div>
          <button
            onClick={handleWrite}
            className="flex shrink-0 items-center gap-1 rounded-full bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            <CordixIcon name="pencil" size={13} /> 글쓰기
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
          <Search size={15} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목, 내용으로 검색"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
          />
        </div>

        <div className="mb-6 flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory("all")}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
              category === "all" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            전체
          </button>
          {COMMUNITY_CATEGORIES.map((c) => (
            <button
              key={c.slug}
              onClick={() => setCategory(c.slug)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                category === c.slug ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-24 text-center text-[13px] text-slate-400">불러오는 중…</div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <CordixIcon name="group" size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-700">{query ? "조건에 맞는 글이 없어요" : "아직 글이 없어요"}</p>
            <p className="mt-1 text-[13px] text-slate-400">{query ? "다른 검색어로 찾아보세요." : "가장 먼저 글을 남겨보세요."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {posts.map((post) => (
              <CommunityPostCard
                key={post.id}
                post={post}
                onOpen={() => router.push(`/community/${post.id}`)}
                onOpenProfile={() => setProfileUserId(post.authorId)}
              />
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

      {loginOpen && <LoginModal reason="커뮤니티에 글을 쓰려면 로그인해주세요." onClose={() => setLoginOpen(false)} />}

      {composerOpen && (
        <CommunityPostComposer
          defaultCategory={isCommunityCategory(category) ? category : undefined}
          onClose={() => setComposerOpen(false)}
          onSaved={(id) => {
            setComposerOpen(false);
            router.push(`/community/${id}`);
          }}
        />
      )}

      {profileUserId != null && <UserProfileSheet userId={profileUserId} onClose={() => setProfileUserId(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function CommunityPostCard({ post, onOpen, onOpenProfile }: { post: CommunityPostSummary; onOpen: () => void; onOpenProfile: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="group block w-full cursor-pointer rounded-3xl border border-slate-200/70 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-indigo-500">{communityCategoryLabel(post.category)}</span>
        <span className="shrink-0 text-[11.5px] text-slate-400">{formatDateLabel(post.createdAt.slice(0, 10))}</span>
      </div>

      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile();
            }}
            className="mb-1.5 flex items-center gap-1.5"
          >
            {post.authorImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- OAuth profile image URL
              <img src={post.authorImage} alt="" loading="lazy" className="h-5 w-5 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-[10px] font-bold text-white">
                {(post.authorName ?? "여").trim().charAt(0)}
              </span>
            )}
            <span className="truncate text-[12px] font-medium text-slate-500 hover:underline">{post.authorName ?? "여행자"}</span>
          </button>
          <h3 className="truncate text-[15.5px] font-bold tracking-tight text-slate-900">{post.title}</h3>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500">{post.content}</p>
          {post.commentCount > 0 && <p className="mt-1.5 text-[11.5px] font-semibold text-slate-400">댓글 {post.commentCount}</p>}
        </div>
        {post.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
          <img src={post.images[0]} alt="" loading="lazy" className="h-[76px] w-[76px] shrink-0 rounded-2xl object-cover" />
        )}
      </div>
    </div>
  );
}
