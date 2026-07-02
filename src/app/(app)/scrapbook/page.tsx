"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plane, Heart, GitFork, MapPin, Calendar, Globe, Lock, MoreHorizontal, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

// ─────────────────────────────────────────────────────────────
// Dummy data
// ─────────────────────────────────────────────────────────────
type Trip = {
  id: string;
  title: string;
  date: string;
  route: string;
  likes: number;
  forks: number;
  cover: string; // gradient
  isPublic: boolean;
};

const TRIPS: Trip[] = [
  {
    id: "t1",
    title: "후쿠오카·유후인 힐링 투어",
    date: "2026년 5월 24일 ~ 5월 27일",
    route: "Tenjin Airbnb → Clio Court → Yufuin",
    likes: 128,
    forks: 34,
    cover: "from-rose-400 via-orange-300 to-amber-300",
    isPublic: true,
  },
  {
    id: "t2",
    title: "오사카 먹방 원정대",
    date: "2026년 3월 8일 ~ 3월 10일",
    route: "쿠로몬 시장 → 도톤보리 → 신세카이",
    likes: 92,
    forks: 21,
    cover: "from-fuchsia-400 via-purple-400 to-indigo-400",
    isPublic: true,
  },
  {
    id: "t3",
    title: "제주 애월 감성 드라이브",
    date: "2026년 1월 17일 ~ 1월 19일",
    route: "애월 카페거리 → 협재해수욕장 → 곽지 노을",
    likes: 61,
    forks: 12,
    cover: "from-sky-400 via-cyan-300 to-emerald-300",
    isPublic: false,
  },
];

const TABS = [
  { key: "past", label: "다녀온 여행" },
  { key: "upcoming", label: "다가오는 일정" },
  { key: "draft", label: "임시 저장" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATS = [
  { key: "trips", label: "총 여행 횟수", value: "12", suffix: "회", icon: Plane, gradient: "from-indigo-500 to-violet-500" },
  { key: "likes", label: "받은 좋아요", value: "1,240", suffix: "", icon: Heart, gradient: "from-rose-500 to-pink-500" },
  { key: "forks", label: "내 일정 퍼감", value: "318", suffix: "", icon: GitFork, gradient: "from-emerald-500 to-teal-500" },
];

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
export default function ScrapbookPage() {
  const [tab, setTab] = useState<TabKey>("past");
  const [trips, setTrips] = useState<Trip[]>(TRIPS);

  const togglePublic = (id: string) =>
    setTrips((ts) => ts.map((t) => (t.id === id ? { ...t, isPublic: !t.isPublic } : t)));

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        {/* ── CREATOR DASHBOARD ── */}
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <p className="text-[13px] font-medium text-slate-500">안녕하세요, Yuna 님 👋</p>
              <h2 className="text-2xl font-bold tracking-tight">크리에이터 대시보드</h2>
            </div>
            <button className="flex items-center gap-0.5 text-[13px] font-semibold text-slate-400 transition-colors hover:text-slate-700">
              인사이트 <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {STATS.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.key}
                  className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span
                    className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${s.gradient} text-white shadow-sm`}
                  >
                    <Icon size={17} />
                  </span>
                  <p className="text-[11px] font-medium text-slate-500">{s.label}</p>
                  <p className="mt-0.5 flex items-baseline gap-0.5 text-2xl font-bold tabular-nums tracking-tight">
                    {s.value}
                    {s.suffix && <span className="text-sm font-semibold text-slate-400">{s.suffix}</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── TABS (segmented control) ── */}
        <div className="mb-6 inline-flex w-full rounded-2xl bg-slate-100 p-1 shadow-inner">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative z-10 flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="tabPill"
                    className="absolute inset-0 -z-10 rounded-xl bg-white shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 34 }}
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB CONTENT ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            {tab === "past" ? (
              <div className="space-y-5">
                {trips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} onToggle={() => togglePublic(trip.id)} />
                ))}
              </div>
            ) : (
              <EmptyState tab={tab} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Album-style trip card
// ─────────────────────────────────────────────────────────────
function TripCard({ trip, onToggle }: { trip: Trip; onToggle: () => void }) {
  return (
    <div className="group overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-200">
      {/* cover */}
      <div className={`relative h-44 bg-gradient-to-br ${trip.cover}`}>
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_25%_20%,white,transparent_45%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

        <div className="absolute right-3 top-3 flex items-center gap-2">
          <Badge
            className={`gap-1 border-none text-[11px] font-semibold backdrop-blur ${
              trip.isPublic ? "bg-white/85 text-emerald-700" : "bg-black/35 text-white"
            }`}
          >
            {trip.isPublic ? <Globe size={11} /> : <Lock size={11} />}
            {trip.isPublic ? "공개" : "비공개"}
          </Badge>
          <button className="flex h-7 w-7 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur transition-colors hover:bg-black/40">
            <MoreHorizontal size={15} />
          </button>
        </div>

        <div className="absolute bottom-3 left-4 right-4">
          <p className="flex items-center gap-1 text-[11px] font-medium text-white/85">
            <Calendar size={11} /> {trip.date}
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-white drop-shadow-sm">{trip.title}</h3>
        </div>
      </div>

      {/* body */}
      <div className="px-4 py-4">
        <div className="flex items-start gap-1.5 text-[12.5px] text-slate-600">
          <MapPin size={14} className="mt-0.5 shrink-0 text-indigo-500" />
          <span className="font-medium leading-snug">{trip.route}</span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
              <Heart size={15} className="fill-rose-500 text-rose-500" />
              {trip.likes}
              <span className="text-[11px] font-normal text-slate-400">Likes</span>
            </span>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
              <GitFork size={15} className="text-emerald-500" />
              {trip.forks}
              <span className="text-[11px] font-normal text-slate-400">Forks</span>
            </span>
          </div>

          {/* public / private switch */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500">
              {trip.isPublic ? "피드 공개" : "나만 보기"}
            </span>
            <Switch checked={trip.isPublic} onCheckedChange={onToggle} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function EmptyState({ tab }: { tab: TabKey }) {
  const copy =
    tab === "upcoming"
      ? { title: "다가오는 일정이 없어요", sub: "Discover에서 새로운 여행을 계획해보세요." }
      : { title: "임시 저장된 일정이 없어요", sub: "작성 중인 여행이 여기에 보관됩니다." };
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Plane size={24} />
      </span>
      <p className="text-sm font-semibold text-slate-700">{copy.title}</p>
      <p className="mt-1 text-[13px] text-slate-400">{copy.sub}</p>
    </div>
  );
}
