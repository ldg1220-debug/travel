"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { Plane, MapPin, Calendar, Globe, Lock, Trash2, PenLine, NotebookPen, Rss } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LoginModal } from "@/components/LoginModal";
import { ReviewComposer } from "@/components/ReviewComposer";
import { TripPostComposer } from "@/components/TripPostComposer";
import { useItineraryStore } from "@/store/itineraryStore";
import { todayISODate, formatDateLabel } from "@/lib/timeline";
import { syncPlanToServer } from "@/lib/planSync";
import type { SavedPlan } from "@/lib/types";

const TABS = [
  { key: "past", label: "다녀온 여행" },
  { key: "upcoming", label: "다가오는 여행" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** A trip's actual scheduled date span — derived from its items, not a stored field, since a plan's `activeDate` is just wherever the user last had the timeline scrolled to. */
function tripDateRange(plan: SavedPlan): { start: string; end: string } {
  const dates = [...new Set(plan.items.map((i) => i.date))].sort();
  return { start: dates[0] ?? plan.activeDate, end: dates[dates.length - 1] ?? plan.activeDate };
}

/** A short "A → B → C 외 N곳" summary in schedule order, deduping consecutive repeats (e.g. a stop that appears both as lunch and as the afternoon's start). */
function tripRouteLabel(plan: SavedPlan): string {
  const ordered = [...plan.items]
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
    .map((i) => i.name);
  const unique = ordered.filter((name, i) => name !== ordered[i - 1]);
  if (unique.length === 0) return "아직 담긴 장소가 없어요";
  return unique.length > 3 ? `${unique.slice(0, 3).join(" → ")} 외 ${unique.length - 3}곳` : unique.join(" → ");
}

const COVER_GRADIENTS = [
  "from-rose-400 via-orange-300 to-amber-300",
  "from-fuchsia-400 via-purple-400 to-indigo-400",
  "from-sky-400 via-cyan-300 to-emerald-300",
  "from-amber-400 via-orange-400 to-rose-400",
  "from-indigo-400 via-blue-400 to-cyan-300",
  "from-emerald-400 via-teal-400 to-sky-300",
];

function coverGradient(planId: string): string {
  let hash = 0;
  for (let i = 0; i < planId.length; i++) hash = (hash * 31 + planId.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
}

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
export default function ScrapbookPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const savedPlans = useItineraryStore((s) => s.savedPlans);
  const loadPlan = useItineraryStore((s) => s.loadPlan);
  const deletePlan = useItineraryStore((s) => s.deletePlan);
  const setPlanRemoteInfo = useItineraryStore((s) => s.setPlanRemoteInfo);

  const [tab, setTab] = useState<TabKey>("past");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ plan: SavedPlan; itineraryId: number } | null>(null);
  const [tripPostTarget, setTripPostTarget] = useState<{ plan: SavedPlan; itineraryId: number } | null>(null);

  const today = todayISODate();
  const { pastTrips, upcomingTrips } = useMemo(() => {
    const past: SavedPlan[] = [];
    const upcoming: SavedPlan[] = [];
    for (const plan of savedPlans) {
      const { end } = tripDateRange(plan);
      (end < today ? past : upcoming).push(plan);
    }
    past.sort((a, b) => tripDateRange(b).end.localeCompare(tripDateRange(a).end));
    upcoming.sort((a, b) => tripDateRange(a).start.localeCompare(tripDateRange(b).start));
    return { pastTrips: past, upcomingTrips: upcoming };
  }, [savedPlans, today]);

  const trips = tab === "past" ? pastTrips : upcomingTrips;

  const totalPlaces = useMemo(
    () => new Set(savedPlans.flatMap((p) => p.items.map((i) => i.placeId))).size,
    [savedPlans],
  );

  const STATS = [
    { key: "trips", label: "저장된 여행 계획", value: String(savedPlans.length), icon: Plane, gradient: "from-indigo-500 to-violet-500" },
    { key: "past", label: "다녀온 여행", value: String(pastTrips.length), icon: Calendar, gradient: "from-emerald-500 to-teal-500" },
    { key: "places", label: "담아본 장소", value: String(totalPlaces), icon: MapPin, gradient: "from-rose-500 to-pink-500" },
  ];

  const openPlan = (plan: SavedPlan) => {
    loadPlan(plan.id);
    router.push("/planner");
  };

  // 후기는 서버의 itineraries 행을 참조하므로, 아직 한 번도 동기화되지
  // 않은(remoteId 없는) 로컬 전용 계획이면 후기 작성을 열기 전에 먼저
  // 조용히 동기화해 실제 서버 id를 확보한다.
  const ensureSynced = async (plan: SavedPlan): Promise<{ plan: SavedPlan; itineraryId: number } | null> => {
    if (plan.remoteId) return { plan, itineraryId: plan.remoteId };
    setSyncingPlanId(plan.id);
    try {
      const { id, shareToken } = await syncPlanToServer(plan.id, plan.region, plan.items, plan.name, plan.remoteId);
      setPlanRemoteInfo(plan.id, id, shareToken);
      return { plan: { ...plan, remoteId: id, shareToken }, itineraryId: id };
    } catch {
      return null;
    } finally {
      setSyncingPlanId(null);
    }
  };

  const openReview = async (plan: SavedPlan) => {
    if (!session?.user) {
      setLoginOpen(true);
      return;
    }
    const resolved = await ensureSynced(plan);
    if (resolved) setReviewTarget(resolved);
  };

  const openTripPost = async (plan: SavedPlan) => {
    if (!session?.user) {
      setLoginOpen(true);
      return;
    }
    const resolved = await ensureSynced(plan);
    if (resolved) setTripPostTarget(resolved);
  };

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        {/* ── OVERVIEW ── */}
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <p className="text-[13px] font-medium text-slate-500">
                {session?.user?.name ? `안녕하세요, ${session.user.name} 님 👋` : "저장한 계획을 모아볼 수 있어요"}
              </p>
              <h2 className="text-2xl font-bold tracking-tight">여행 보관함</h2>
            </div>
            <button
              onClick={() => router.push("/feed")}
              className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-indigo-500 transition-colors hover:text-indigo-700"
            >
              <Rss size={14} /> 후기 피드
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
                  <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">{s.value}</p>
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
                {(t.key === "past" ? pastTrips.length : upcomingTrips.length) > 0 && (
                  <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                    {t.key === "past" ? pastTrips.length : upcomingTrips.length}
                  </span>
                )}
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
            {trips.length > 0 ? (
              <div className="space-y-5">
                {trips.map((plan) => (
                  <TripCard
                    key={plan.id}
                    plan={plan}
                    confirming={confirmDeleteId === plan.id}
                    showReview={tab === "past"}
                    reviewSyncing={syncingPlanId === plan.id}
                    onOpen={() => openPlan(plan)}
                    onReview={() => openReview(plan)}
                    onTripPost={() => openTripPost(plan)}
                    onDeleteRequest={() => setConfirmDeleteId(plan.id)}
                    onDeleteCancel={() => setConfirmDeleteId(null)}
                    onDeleteConfirm={() => {
                      deletePlan(plan.id);
                      setConfirmDeleteId(null);
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyState tab={tab} onPlan={() => router.push("/discover")} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {loginOpen && <LoginModal reason="후기를 작성하려면 로그인해주세요." onClose={() => setLoginOpen(false)} />}
      {reviewTarget && (
        <ReviewComposer plan={reviewTarget.plan} itineraryId={reviewTarget.itineraryId} onClose={() => setReviewTarget(null)} />
      )}
      {tripPostTarget && (
        <TripPostComposer plan={tripPostTarget.plan} itineraryId={tripPostTarget.itineraryId} onClose={() => setTripPostTarget(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Album-style trip card — driven entirely by a real SavedPlan, not mock
// social stats (there's no likes/forks/public-feed backend anywhere else
// in the app, so this used to just display fabricated numbers).
// ─────────────────────────────────────────────────────────────
function TripCard({
  plan,
  confirming,
  showReview,
  reviewSyncing,
  onOpen,
  onReview,
  onTripPost,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
}: {
  plan: SavedPlan;
  confirming: boolean;
  showReview: boolean;
  reviewSyncing: boolean;
  onOpen: () => void;
  onReview: () => void;
  onTripPost: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}) {
  const { start, end } = tripDateRange(plan);
  const dateLabel = start === end ? formatDateLabel(start) : `${formatDateLabel(start)} ~ ${formatDateLabel(end)}`;
  const dayCount = new Set(plan.items.map((i) => i.date)).size;
  const isShared = Boolean(plan.shareToken);

  return (
    <div className="group overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-200">
      {/* cover */}
      <button onClick={onOpen} className={`relative block h-44 w-full bg-gradient-to-br ${coverGradient(plan.id)} text-left`}>
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_25%_20%,white,transparent_45%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

        <div className="absolute right-3 top-3">
          <Badge className={`gap-1 border-none text-[11px] font-semibold backdrop-blur ${isShared ? "bg-white/85 text-emerald-700" : "bg-black/35 text-white"}`}>
            {isShared ? <Globe size={11} /> : <Lock size={11} />}
            {isShared ? "공유됨" : "나만 보기"}
          </Badge>
        </div>

        <div className="absolute bottom-3 left-4 right-4">
          <p className="flex items-center gap-1 text-[11px] font-medium text-white/85">
            <Calendar size={11} /> {dateLabel}
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-white drop-shadow-sm">{plan.name}</h3>
        </div>
      </button>

      {/* body */}
      <div className="px-4 py-4">
        <button onClick={onOpen} className="flex w-full items-start gap-1.5 text-left text-[12.5px] text-slate-600">
          <MapPin size={14} className="mt-0.5 shrink-0 text-indigo-500" />
          <span className="font-medium leading-snug">{tripRouteLabel(plan)}</span>
        </button>

        {showReview && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={onReview}
              disabled={reviewSyncing}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60"
            >
              <PenLine size={13} /> {reviewSyncing ? "준비 중…" : "장소 후기"}
            </button>
            <button
              onClick={onTripPost}
              disabled={reviewSyncing}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/60 py-2 text-[12.5px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-60"
            >
              <NotebookPen size={13} /> {reviewSyncing ? "준비 중…" : "여행 후기"}
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-[12.5px] font-medium text-slate-500">
            {dayCount > 0 ? `${dayCount}일 · ${plan.items.length}개 일정` : "일정 없음"}
          </span>

          {confirming ? (
            <div className="flex items-center gap-2.5">
              <button onClick={onDeleteConfirm} className="text-[12.5px] font-semibold text-rose-500">
                삭제
              </button>
              <button onClick={onDeleteCancel} className="text-[12.5px] text-slate-400">
                취소
              </button>
            </div>
          ) : (
            <button
              onClick={onDeleteRequest}
              aria-label={`${plan.name} 삭제`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function EmptyState({ tab, onPlan }: { tab: TabKey; onPlan: () => void }) {
  const copy =
    tab === "upcoming"
      ? { title: "다가오는 여행이 없어요", sub: "탐색에서 새로운 여행을 계획해보세요." }
      : { title: "다녀온 여행이 없어요", sub: "일정을 마친 저장된 계획이 여기에 모여요." };
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Plane size={24} />
      </span>
      <p className="text-sm font-semibold text-slate-700">{copy.title}</p>
      <p className="mt-1 text-[13px] text-slate-400">{copy.sub}</p>
      {tab === "upcoming" && (
        <button onClick={onPlan} className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700">
          여행 계획짜기
        </button>
      )}
    </div>
  );
}
