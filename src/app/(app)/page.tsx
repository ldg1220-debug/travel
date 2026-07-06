"use client";

import Link from "next/link";
import { Search, Calendar, Book, ChevronRight, Flame, MapPin, TrendingUp, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const QUICK_ACCESS = [
  {
    href: "/course",
    title: "코스 만들기",
    description: "지역만 고르면 관광지·맛집·카페까지 한 번에",
    icon: Sparkles,
    gradient: "from-indigo-500 to-violet-500",
  },
  {
    href: "/discover",
    title: "여행 탐색하기",
    description: "인기 스팟과 실시간 맛집을 검색해보세요",
    icon: Search,
    gradient: "from-sky-500 to-cyan-400",
  },
  {
    href: "/planner",
    title: "일정 계획하기",
    description: "지도와 타임라인으로 여행을 짜보세요",
    icon: Calendar,
    gradient: "from-rose-500 to-orange-400",
  },
  {
    href: "/scrapbook",
    title: "내 기록 보관함",
    description: "다녀온 여행과 저장한 코스를 확인하세요",
    icon: Book,
    gradient: "from-emerald-500 to-teal-500",
  },
] as const;

// Mirrors the top spot in /discover's 국내 Trending Now list — a small
// static teaser here, not wired to live data, since this is just a preview
// pointing at the real (also-dummy, for now) list on /discover.
const TOP_TRENDING = {
  name: "애월 감성 카페거리",
  region: "제주 · 애월",
  tag: "카페",
  saves: "1.2k",
  gradient: "from-rose-400 to-orange-300",
};

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
export default function HomePage() {
  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        {/* ── GREETING ── */}
        <section className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">안녕하세요, Yejin님 👋</h1>
          <p className="mt-1 text-[13px] text-slate-500">오늘은 어디로 떠나볼까요?</p>
        </section>

        {/* ── QUICK ACCESS ── */}
        <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACCESS.map(({ href, title, description, icon: Icon, gradient }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-200"
            >
              <span
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-sm`}
              >
                <Icon size={22} />
              </span>
              <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
              <p className="mt-1 flex-1 text-[13px] text-slate-500">{description}</p>
              <span className="mt-4 flex items-center gap-0.5 text-[13px] font-semibold text-indigo-600 transition-colors group-hover:text-indigo-700">
                시작하기 <ChevronRight size={15} />
              </span>
            </Link>
          ))}
        </section>

        {/* ── TRENDING NOW PREVIEW ── */}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-rose-500">
                <Flame size={17} />
              </span>
              <h2 className="text-xl font-bold tracking-tight">
                <span className="mr-1">🔥</span>지금 뜨는 여행지
              </h2>
            </div>
            <Link
              href="/discover"
              className="flex items-center gap-0.5 text-[13px] font-semibold text-slate-400 transition-colors hover:text-slate-700"
            >
              전체보기 <ChevronRight size={15} />
            </Link>
          </div>

          <Link
            href="/discover"
            className="group block overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-200"
          >
            <div className={`relative h-36 bg-gradient-to-br ${TOP_TRENDING.gradient}`}>
              <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_30%_20%,white,transparent_40%)]" />
              <span className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-lg bg-black/30 text-xs font-bold text-white backdrop-blur">
                1
              </span>
              <div className="absolute right-3 top-3">
                <Badge className="border-none bg-white/85 text-[10px] font-semibold text-slate-700 backdrop-blur">
                  {TOP_TRENDING.tag}
                </Badge>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-4">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-900">{TOP_TRENDING.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
                  <MapPin size={12} /> {TOP_TRENDING.region}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <TrendingUp size={12} className="text-rose-500" />
                  {TOP_TRENDING.saves}명 저장
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-indigo-600 transition-colors group-hover:text-indigo-700">
                더보기 <ChevronRight size={15} />
              </span>
            </div>
          </Link>
        </section>
      </div>
    </div>
  );
}
