"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Rss, X, ChevronLeft } from "lucide-react";
import { CordixIcon, type CordixIconName } from "@/components/icons/CordixIcon";
import { Badge } from "@/components/ui/badge";
import { LoginModal } from "@/components/LoginModal";
import { ReviewComposer } from "@/components/ReviewComposer";
import { TripPostComposer } from "@/components/TripPostComposer";
import { useItineraryStore } from "@/store/itineraryStore";
import { formatDateLabel } from "@/lib/timeline";
import { syncPlanToServer } from "@/lib/planSync";
import { fetchMyTripPosts, type TripPost, type Visibility } from "@/lib/api";
import type { SavedPlan } from "@/lib/types";

const VISIBILITY_ICON: Record<Visibility, CordixIconName> = { public: "globe", friends: "group", custom: "user", private: "lock" };
const VISIBILITY_LABEL: Record<Visibility, string> = { public: "전체공개", friends: "친구공개", custom: "특정공개", private: "비공개" };

// "다녀온 여행"인지는 날짜가 지났는지가 아니라 그 계획에 대해 실제로
// 여행 후기를 남겼는지로 정한다 — A/B/C 세 계획을 세워뒀다고 셋 다
// 다녀온 게 아니듯, 날짜가 지나는 것만으론 아무 의미가 없다.
const TABS = [
  { key: "written", label: "다녀온 여행" },
  { key: "notWritten", label: "여행 계획" },
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

  const [tab, setTab] = useState<TabKey>("written");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ plan: SavedPlan; itineraryId: number } | null>(null);
  const [tripPostTarget, setTripPostTarget] = useState<{ plan: SavedPlan | null; itineraryId: number | null } | null>(null);
  const [newPostChooserOpen, setNewPostChooserOpen] = useState(false);
  const [myPosts, setMyPosts] = useState<TripPost[]>([]);

  const userId = session?.user?.id;
  useEffect(() => {
    let cancelled = false;
    // fetchMyTripPosts() already resolves to [] for a logged-out user (the
    // API returns an empty list rather than 401), so no separate branch
    // is needed here — logging out naturally clears the set on the next run.
    fetchMyTripPosts().then((posts) => {
      if (cancelled) return;
      setMyPosts(posts);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const postedItineraryIds = useMemo(
    () => new Set(myPosts.filter((p): p is TripPost & { itineraryId: number } => p.itineraryId != null).map((p) => p.itineraryId)),
    [myPosts],
  );
  // 대표 사진 소스 — 그 계획으로 쓴 여행 후기에 실제 업로드한 사진이
  // 있으면 그걸 우선 쓰고(제일 진짜 같은 사진), 없으면 계획의 도시로
  // 실시간 장소 사진을 하나 찾아온다(코스 만들기 타일과 같은 방식). 실패하면
  // TripCard가 알아서 기존 그라디언트 커버로 되돌아간다.
  const coverByItineraryId = useMemo(
    () => new Map(myPosts.filter((p) => p.itineraryId != null && p.images.length > 0).map((p) => [p.itineraryId as number, p.images[0]])),
    [myPosts],
  );
  const coverSrcForPlan = (plan: SavedPlan): string | null => {
    const uploaded = plan.remoteId != null ? coverByItineraryId.get(plan.remoteId) : undefined;
    if (uploaded) return uploaded;
    if (!plan.currentCity) return null;
    return `/api/discover/spot-photo?q=${encodeURIComponent(`${plan.currentCity} 여행`)}`;
  };
  // 계획 없이 "완전 새로 작성"된 후기 — 연결된 계획이 없어 위 계획
  // 카드 목록 어디에도 나타나지 않으므로, 다시 열어보거나 수정하려면
  // 여기서 직접 목록을 보여줘야 한다.
  const planlessPosts = useMemo(() => myPosts.filter((p) => p.itineraryId == null), [myPosts]);

  const { writtenTrips, notWrittenTrips } = useMemo(() => {
    const written: SavedPlan[] = [];
    const notWritten: SavedPlan[] = [];
    for (const plan of savedPlans) {
      (plan.remoteId != null && postedItineraryIds.has(plan.remoteId) ? written : notWritten).push(plan);
    }
    written.sort((a, b) => tripDateRange(b).end.localeCompare(tripDateRange(a).end));
    notWritten.sort((a, b) => tripDateRange(b).start.localeCompare(tripDateRange(a).start));
    return { writtenTrips: written, notWrittenTrips: notWritten };
  }, [savedPlans, postedItineraryIds]);

  const trips = tab === "written" ? writtenTrips : notWrittenTrips;

  const totalPlaces = useMemo(
    () => new Set(savedPlans.flatMap((p) => p.items.map((i) => i.placeId))).size,
    [savedPlans],
  );

  const STATS: {
    key: string;
    label: string;
    value: string;
    gradient: string;
    iconName: CordixIconName | null;
  }[] = [
    { key: "trips", label: "저장된 여행 계획", value: String(savedPlans.length), iconName: "plane", gradient: "from-indigo-500 to-violet-500" },
    { key: "written", label: "다녀온 여행", value: String(writtenTrips.length), iconName: null, gradient: "from-emerald-500 to-teal-500" },
    { key: "places", label: "담아본 장소", value: String(totalPlaces), iconName: "pin", gradient: "from-rose-500 to-pink-500" },
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

  // 계획에 매이지 않은 "완전 새로 작성" 후기 — 동기화할 게 없으니 바로 연다.
  const openFreshTripPost = () => {
    if (!session?.user) {
      setLoginOpen(true);
      return;
    }
    setTripPostTarget({ plan: null, itineraryId: null });
  };

  const openNewPostChooser = () => {
    if (!session?.user) {
      setLoginOpen(true);
      return;
    }
    setNewPostChooserOpen(true);
  };

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        {/* ── OVERVIEW ── */}
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <p className="text-[13px] font-medium text-slate-500">
                {session?.user?.name ? `안녕하세요, ${session.user.name} 님` : "저장한 계획을 모아볼 수 있어요"}
              </p>
              <h2 className="text-2xl font-bold tracking-tight">여행 보관함</h2>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={() => router.push("/feed")}
                className="flex items-center gap-1 text-[13px] font-semibold text-indigo-500 transition-colors hover:text-indigo-700"
              >
                <Rss size={14} /> 후기 피드
              </button>
              <button
                onClick={openNewPostChooser}
                className="flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <CordixIcon name="pencil" size={13} /> 새 여행 후기
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {STATS.map((s) => {
              return (
                <div
                  key={s.key}
                  className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span
                    className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${s.gradient} text-white shadow-sm`}
                  >
                    {s.iconName ? <CordixIcon name={s.iconName} size={17} stroke="#fff" accent="#fff" /> : <Calendar size={17} />}
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
                {(t.key === "written" ? writtenTrips.length : notWrittenTrips.length) > 0 && (
                  <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                    {t.key === "written" ? writtenTrips.length : notWrittenTrips.length}
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
                    coverSrc={coverSrcForPlan(plan)}
                    confirming={confirmDeleteId === plan.id}
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
              <EmptyState tab={tab} onPlan={() => router.push("/discover")} onWrite={openNewPostChooser} />
            )}
          </motion.div>
        </AnimatePresence>

        {planlessPosts.length > 0 && (
          <section className="mt-8">
            <p className="mb-3 text-[13px] font-bold text-slate-700">계획 없이 쓴 여행 후기</p>
            <div className="space-y-2">
              {planlessPosts.map((post) => (
                <button
                  key={post.id}
                  onClick={() => router.push(`/trip/${post.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                >
                  {post.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded blob URL
                    <img src={post.images[0]} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-slate-800">{post.title}</span>
                    <span className="flex items-center gap-1 text-[11.5px] text-slate-400">
                      <CordixIcon name={VISIBILITY_ICON[post.visibility]} size={11} />
                      {VISIBILITY_LABEL[post.visibility]} · {formatDateLabel(post.createdAt.slice(0, 10))}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {loginOpen && <LoginModal reason="후기를 작성하려면 로그인해주세요." onClose={() => setLoginOpen(false)} />}
      {reviewTarget && (
        <ReviewComposer plan={reviewTarget.plan} itineraryId={reviewTarget.itineraryId} onClose={() => setReviewTarget(null)} />
      )}
      {tripPostTarget && (
        <TripPostComposer
          plan={tripPostTarget.plan}
          itineraryId={tripPostTarget.itineraryId}
          onClose={() => {
            setTripPostTarget(null);
            fetchMyTripPosts().then(setMyPosts);
          }}
        />
      )}
      {newPostChooserOpen && (
        <NewPostChooser
          plans={savedPlans}
          onPickPlan={(plan) => {
            setNewPostChooserOpen(false);
            openTripPost(plan);
          }}
          onFresh={() => {
            setNewPostChooserOpen(false);
            openFreshTripPost();
          }}
          onClose={() => setNewPostChooserOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// "계획 불러오기"(저장된 계획의 장소를 자동으로 가져옴) vs "완전 새로
// 작성"(계획 없이 자유 작성, 장소는 검색으로 추가) 중 고르는 진입점 —
// 여행 후기는 반드시 어떤 계획에 매여야 할 이유가 없으므로 둘 다 지원한다.
function NewPostChooser({
  plans,
  onPickPlan,
  onFresh,
  onClose,
}: {
  plans: SavedPlan[];
  onPickPlan: (plan: SavedPlan) => void;
  onFresh: () => void;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center gap-2">
          {picking && (
            <button
              onClick={() => setPicking(false)}
              aria-label="뒤로"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
            >
              <ChevronLeft size={17} />
            </button>
          )}
          <h3 className="flex-1 text-lg font-bold">{picking ? "어떤 계획인가요?" : "여행 후기 쓰기"}</h3>
          <button onClick={onClose} aria-label="닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        {!picking ? (
          <div className="space-y-2.5">
            <button
              onClick={() => setPicking(true)}
              disabled={plans.length === 0}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
                <CordixIcon name="folder" size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-slate-800">계획 불러오기</span>
                <span className="block text-[12px] text-slate-400">{plans.length > 0 ? "저장된 계획에서 장소를 가져와요" : "저장된 계획이 없어요"}</span>
              </span>
            </button>
            <button
              onClick={onFresh}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <CordixIcon name="pencil" size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-slate-800">완전 새로 작성</span>
                <span className="block text-[12px] text-slate-400">계획 없이 자유롭게 — 장소는 검색해서 추가해요</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {plans.map((plan) => {
              const { start, end } = tripDateRange(plan);
              const dateLabel = start === end ? formatDateLabel(start) : `${formatDateLabel(start)} ~ ${formatDateLabel(end)}`;
              return (
                <button
                  key={plan.id}
                  onClick={() => onPickPlan(plan)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-xl border border-slate-100 px-3.5 py-2.5 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/60"
                >
                  <span className="w-full truncate text-[13.5px] font-semibold text-slate-800">{plan.name}</span>
                  <span className="w-full truncate text-[11.5px] text-slate-400">
                    {dateLabel} · {tripRouteLabel(plan)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
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
  coverSrc,
  confirming,
  reviewSyncing,
  onOpen,
  onReview,
  onTripPost,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
}: {
  plan: SavedPlan;
  /** A real photo to use as the card cover — the linked trip post's own uploaded photo if there is one, else a live representative-place lookup. Null falls back to the plain gradient. */
  coverSrc: string | null;
  confirming: boolean;
  reviewSyncing: boolean;
  onOpen: () => void;
  onReview: () => void;
  onTripPost: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const { start, end } = tripDateRange(plan);
  const dateLabel = start === end ? formatDateLabel(start) : `${formatDateLabel(start)} ~ ${formatDateLabel(end)}`;
  const dayCount = new Set(plan.items.map((i) => i.date)).size;
  const isShared = Boolean(plan.shareToken);
  const hasPhoto = Boolean(coverSrc) && !coverFailed;

  return (
    <div className="group overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-200">
      {/* cover */}
      <button
        onClick={onOpen}
        className={`relative block h-44 w-full text-left ${hasPhoto ? "bg-slate-200" : `bg-gradient-to-br ${coverGradient(plan.id)}`}`}
      >
        {hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- representative photo (uploaded blob URL or live Places proxy)
          <img src={coverSrc!} alt="" loading="lazy" onError={() => setCoverFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_25%_20%,white,transparent_45%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />

        <div className="absolute right-3 top-3">
          <Badge className={`gap-1 border-none text-[11px] font-semibold backdrop-blur ${isShared ? "bg-white/85 text-emerald-700" : "bg-black/35 text-white"}`}>
            {isShared ? <CordixIcon name="globe" size={11} /> : <CordixIcon name="lock" size={11} />}
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
          <CordixIcon name="pin" size={14} className="mt-0.5 shrink-0 text-indigo-500" />
          <span className="font-medium leading-snug">{tripRouteLabel(plan)}</span>
        </button>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={onReview}
            disabled={reviewSyncing}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60"
          >
            <CordixIcon name="pencil" size={13} /> {reviewSyncing ? "준비 중…" : "장소 후기"}
          </button>
          <button
            onClick={onTripPost}
            disabled={reviewSyncing}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/60 py-2 text-[12.5px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-60"
          >
            <CordixIcon name="pencil" size={13} /> {reviewSyncing ? "준비 중…" : "여행 후기"}
          </button>
        </div>

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
              <CordixIcon name="trash" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function EmptyState({ tab, onPlan, onWrite }: { tab: TabKey; onPlan: () => void; onWrite: () => void }) {
  const copy =
    tab === "notWritten"
      ? { title: "아직 후기를 안 쓴 계획이 없어요", sub: "탐색에서 새로운 여행을 계획해보세요." }
      : { title: "다녀온 여행이 없어요", sub: "여행 후기를 남긴 계획이 여기에 모여요." };
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 py-20 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <CordixIcon name="plane" size={24} />
      </span>
      <p className="text-sm font-semibold text-slate-700">{copy.title}</p>
      <p className="mt-1 text-[13px] text-slate-400">{copy.sub}</p>
      {tab === "notWritten" ? (
        <button onClick={onPlan} className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700">
          여행 계획짜기
        </button>
      ) : (
        <button onClick={onWrite} className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700">
          여행 후기 쓰기
        </button>
      )}
    </div>
  );
}
