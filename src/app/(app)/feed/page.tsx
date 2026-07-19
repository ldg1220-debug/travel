"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Rss, Loader2, Search } from "lucide-react";
import { fetchFeed, type FeedPost } from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";
import { LoginModal } from "@/components/LoginModal";
import type { Region } from "@/lib/types";

const SEARCH_DEBOUNCE_MS = 400;
const REGION_OPTIONS: { value: Region | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "domestic", label: "국내" },
  { value: "international", label: "해외" },
];
const SCOPE_OPTIONS: { value: "all" | "following"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "following", label: "팔로잉" },
];

/** Public feed of everyone's published 여행 후기 (blog/Instagram-style trip posts) — browsable without logging in, same as /discover. Supports filtering by region, scope(전체/팔로잉), and free-text search (post title/내용, 여행 제목, 다녀온 장소 이름). */
export default function FeedPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<Region | "all">("all");
  const [scope, setScope] = useState<"all" | "following">("all");
  const [loginOpen, setLoginOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetchFeed(1, 10, { region: region === "all" ? undefined : region, q: query, scope }).then((data) => {
        setPosts(data.posts);
        setHasMore(data.pagination.hasMore);
        setPage(1);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, region, scope]);

  const loadMore = async () => {
    setLoadingMore(true);
    const next = page + 1;
    const data = await fetchFeed(next, 10, { region: region === "all" ? undefined : region, q: query, scope });
    setPosts((prev) => [...prev, ...data.posts]);
    setHasMore(data.pagination.hasMore);
    setPage(next);
    setLoadingMore(false);
  };

  const handleScopeChange = (value: "all" | "following") => {
    if (value === "following" && !session?.user) {
      setLoginOpen(true);
      return;
    }
    setScope(value);
  };

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-lg px-4 pb-24 pt-8 sm:px-6">
        <div className="mb-6 flex items-center gap-2">
          <Rss size={20} className="text-indigo-500" />
          <h2 className="text-2xl font-bold tracking-tight">후기 피드</h2>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
          <Search size={15} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목, 지역, 장소로 후기 검색"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
          />
        </div>

        <div className="mb-3 flex gap-1.5">
          {SCOPE_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => handleScopeChange(s.value)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                scope === s.value ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mb-6 flex gap-1.5">
          {REGION_OPTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setRegion(r.value)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                region === r.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-24 text-center text-[13px] text-slate-400">불러오는 중…</div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Rss size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-700">
              {scope === "following"
                ? "팔로잉한 사람이 공개한 후기가 없어요"
                : query || region !== "all"
                  ? "조건에 맞는 후기가 없어요"
                  : "아직 공개된 후기가 없어요"}
            </p>
            <p className="mt-1 text-[13px] text-slate-400">
              {scope === "following"
                ? "관심 있는 사람을 팔로우하면 여기서 후기를 모아볼 수 있어요."
                : query || region !== "all"
                  ? "다른 검색어나 지역으로 찾아보세요."
                  : "여행 보관함에서 첫 여행 후기를 남겨보세요."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <FeedCard key={post.id} post={post} onOpen={() => router.push(`/trip/${post.id}`)} />
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

      {loginOpen && <LoginModal reason="팔로잉 피드를 보려면 로그인해주세요." onClose={() => setLoginOpen(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 리스트형 후기 카드 — 지역 태그·날짜 줄, 작성자 아바타·닉네임 줄, 제목,
// 본문 2줄 미리보기 + 우측 정사각 썸네일. 전엔 상단 와이드 사진 아래 글자만
// 있어 작성자/지역이 눈에 안 들어왔는데, 메타 정보를 위계대로 앞세운다.
function FeedCard({ post, onOpen }: { post: FeedPost; onOpen: () => void }) {
  // 본문의 "#장소이름" 해시태그는 상세에서만 의미가 있으니(호버 팝오버),
  // 미리보기에선 # 없이 장소 이름 텍스트만 남긴다.
  const preview = post.content.replace(/#(\S+)/g, "$1");
  return (
    <button
      onClick={onOpen}
      className="group block w-full rounded-3xl border border-slate-200/70 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-indigo-500">
          {post.region === "domestic" ? "국내" : post.region === "international" ? "해외" : "여행"}
          {post.tripTitle && <span className="font-medium text-slate-400"> · {post.tripTitle}</span>}
        </span>
        <span className="shrink-0 text-[11.5px] text-slate-400">{formatDateLabel(post.createdAt.slice(0, 10))}</span>
      </div>

      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5">
            {post.authorImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- OAuth profile image URL
              <img src={post.authorImage} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-[10px] font-bold text-white">
                {(post.authorName ?? "여").trim().charAt(0)}
              </span>
            )}
            <span className="truncate text-[12px] font-medium text-slate-500">{post.authorName ?? "여행자"}</span>
          </div>
          <h3 className="truncate text-[15.5px] font-bold tracking-tight text-slate-900">{post.title}</h3>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500">{preview}</p>
        </div>
        {post.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
          <img src={post.images[0]} alt="" className="h-[76px] w-[76px] shrink-0 rounded-2xl object-cover" />
        )}
      </div>
    </button>
  );
}
