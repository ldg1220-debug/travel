"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Calendar, ChevronRight, Heart, FolderOpen } from "lucide-react";
import { CordixIcon, type CordixIconName } from "@/components/icons/CordixIcon";
import { useItineraryStore } from "@/store/itineraryStore";
import { fetchFeed, type FeedPost } from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";

// 카드 이름은 사이드바 메뉴와 1:1로 맞춘다 (여행 계획짜기/계획/여행 보관함).
// 코스 만들기는 여행 계획짜기의 하위 플로우라 홈 카드에서는 뺐다.
const QUICK_ACCESS: { href: string; title: string; description: string; icon: CordixIconName }[] = [
  {
    href: "/discover",
    title: "여행 계획짜기",
    description: "인기 스팟과 실시간 맛집을 검색하고 코스를 만들어보세요",
    icon: "trip-map",
  },
  {
    href: "/planner",
    title: "계획",
    description: "지도와 타임라인으로 여행을 짜보세요",
    icon: "plan-check",
  },
  {
    href: "/scrapbook",
    title: "여행 보관함",
    description: "다녀온 여행과 저장한 코스를 확인하세요",
    icon: "trip-archive",
  },
];

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
export default function HomePage() {
  const { data: session } = useSession();
  // 로그인한 사용자면 닉네임으로 인사, 아니면 일반 인사.
  const nickname = session?.user?.nickname;
  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        {/* ── GREETING ── (the brand wordmark + slogan live in the top bar) */}
        <section className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            {nickname ? `안녕하세요, ${nickname}님` : "안녕하세요"}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">오늘은 어디로 떠나볼까요?</p>
        </section>

        {/* ── QUICK ACCESS ── */}
        <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {QUICK_ACCESS.map(({ href, title, description, icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-200 sm:flex-col sm:items-start sm:p-5 dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-none"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 p-2 text-slate-900 shadow-sm sm:mb-4 sm:h-12 sm:w-12 dark:bg-slate-800 dark:text-slate-100">
                <CordixIcon name={icon} size={26} />
              </span>
              <div className="min-w-0 flex-1 sm:w-full sm:flex-none">
                <h2 className="truncate text-[15px] font-bold tracking-tight text-slate-900 sm:text-base dark:text-slate-100">{title}</h2>
                <p className="mt-0.5 line-clamp-1 text-[12.5px] text-slate-500 sm:mt-1 sm:line-clamp-none sm:text-[13px] dark:text-slate-400">
                  {description}
                </p>
                <span className="mt-4 hidden items-center gap-0.5 text-[13px] font-semibold text-indigo-600 transition-colors group-hover:text-indigo-700 sm:flex">
                  시작하기 <ChevronRight size={15} />
                </span>
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-300 sm:hidden" />
            </Link>
          ))}
        </section>

        <ResumeSection />
        <LatestFeedSection />
      </div>
    </div>
  );
}

/**
 * "내 여행 현황" — 예전 '지금 뜨는 여행지' 미리보기 자리를 대체. 그 카드와
 * 전체보기가 둘 다 /discover로만 가서 위 '여행 계획짜기' 카드와 완전히
 * 중복이었기 때문에, 대신 이 사용자의 실제 상태(진행 중인 계획 / 저장된
 * 계획 / 찜한 장소)를 이어서 하도록 보여준다. 아무것도 없으면 시작 CTA.
 * store 값은 localStorage에서 오므로 hydration mismatch를 피하기 위해
 * 마운트 후에만 읽는다.
 */
function ResumeSection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const items = useItineraryStore((s) => s.items);
  const currentCity = useItineraryStore((s) => s.currentCity);
  const savedPlans = useItineraryStore((s) => s.savedPlans);
  const savedPlaces = useItineraryStore((s) => s.savedPlaces);
  const setActiveDate = useItineraryStore((s) => s.setActiveDate);

  if (!mounted) return null;

  const hasAnything = items.length > 0 || savedPlans.length > 0 || savedPlaces.length > 0;
  // "이어서 하기" should land on whichever day the plan actually has stops
  // on, not always today's real-world date — otherwise resuming an
  // in-progress trip opens a blank day and looks like the plan vanished.
  const earliestItemDate = items.length > 0 ? items.slice().sort((a, b) => a.date.localeCompare(b.date))[0].date : null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-indigo-500 dark:bg-slate-800">
          <CordixIcon name="trip-route" size={17} />
        </span>
        <h2 className="text-xl font-bold tracking-tight">내 여행 현황</h2>
      </div>

      {hasAnything ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* 진행 중인 계획 — 이어서 하기 */}
          <Link
            href="/planner"
            onClick={() => {
              if (earliestItemDate) setActiveDate(earliestItemDate);
            }}
            className="group rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-indigo-500">
              <Calendar size={13} /> 진행 중인 계획
            </p>
            <p className="mt-1.5 truncate text-lg font-bold">{items.length > 0 ? currentCity : "새 여행"}</p>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
              {items.length > 0 ? `일정 ${items.length}곳 · 이어서 계획하기` : "타임라인이 비어있어요"}
            </p>
            <span className="mt-3 flex items-center gap-0.5 text-[12.5px] font-semibold text-indigo-600 group-hover:text-indigo-700">
              플래너 열기 <ChevronRight size={14} />
            </span>
          </Link>

          {/* 저장된 계획 */}
          <Link
            href="/planner"
            className="group rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-500">
              <FolderOpen size={13} /> 저장된 계획
            </p>
            <p className="mt-1.5 text-lg font-bold">{savedPlans.length}개</p>
            <p className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">
              {savedPlans.length > 0 ? savedPlans.map((p) => p.name).slice(0, 2).join(" · ") : "계획을 이름 붙여 보관해보세요"}
            </p>
            <span className="mt-3 flex items-center gap-0.5 text-[12.5px] font-semibold text-emerald-600 group-hover:text-emerald-700">
              계획 전환하기 <ChevronRight size={14} />
            </span>
          </Link>

          {/* 관심 장소 */}
          <Link
            href="/saved-places"
            className="group rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-rose-500">
              <Heart size={13} /> 관심 장소
            </p>
            <p className="mt-1.5 text-lg font-bold">{savedPlaces.length}곳</p>
            <p className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">
              {savedPlaces.length > 0 ? savedPlaces.map((p) => p.name).slice(0, 2).join(" · ") : "마음에 드는 곳을 찜해보세요"}
            </p>
            <span className="mt-3 flex items-center gap-0.5 text-[12.5px] font-semibold text-rose-600 group-hover:text-rose-700">
              보관함 열기 <ChevronRight size={14} />
            </span>
          </Link>
        </div>
      ) : (
        /* 아직 아무 데이터도 없는 첫 방문 — 시작 CTA */
        <Link
          href="/discover"
          className="group flex items-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-6 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/60"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
            <CordixIcon name="trip-route" size={22} stroke="#fff" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">아직 계획 중인 여행이 없어요</span>
            <span className="block text-[12.5px] text-slate-500 dark:text-slate-400">
              여행 계획짜기에서 장소를 찾아 첫 일정을 만들어보세요
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-slate-300 transition-colors group-hover:text-indigo-500" />
        </Link>
      )}
    </section>
  );
}

/**
 * "최신 여행 후기" — 홈 하단 미리보기. 진짜 친구/팔로우 관계는 아직 없어서
 * (추후 별도 기능으로 예정) 지금은 전체 공개 피드의 최신 글 몇 개를 보여
 * 주고, "더 보기"는 지역/장소로 검색할 수 있는 /feed로 보낸다.
 */
function LatestFeedSection() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    fetchFeed(1, 4).then((data) => setPosts(data.posts));
  }, []);

  if (posts !== null && posts.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-indigo-500 dark:bg-slate-800">
            <CordixIcon name="feed-announce" size={17} />
          </span>
          <h2 className="text-xl font-bold tracking-tight">최신 여행 후기</h2>
        </div>
        <Link href="/feed" className="flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-indigo-500 hover:text-indigo-700">
          더 보기 <ChevronRight size={14} />
        </Link>
      </div>

      {posts === null ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/trip/${post.id}`}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
            >
              {post.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
                <img src={post.images[0]} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-400 text-white">
                  <CordixIcon name="feed-announce" size={18} stroke="#fff" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-400">
                  {post.authorImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- OAuth profile image URL
                    <img src={post.authorImage} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-400 text-[9px] font-bold text-white">
                      {(post.authorName ?? "여").trim().charAt(0)}
                    </span>
                  )}
                  <span className="truncate">
                    {post.authorName ?? "여행자"}
                    {post.tripTitle && ` · ${post.tripTitle}`}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-[14px] font-bold text-slate-900 dark:text-slate-100">{post.title}</p>
                <p className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">{formatDateLabel(post.createdAt.slice(0, 10))}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
