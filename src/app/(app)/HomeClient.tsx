"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Calendar, Check, ChevronRight, Heart, Plus, Search, Sparkles, X } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { Input } from "@/components/ui/input";
import { useItineraryStore } from "@/store/itineraryStore";
import { fetchFeed, type FeedPost } from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";
import { suppressStaleActiveDateCorrection } from "@/lib/plannerSession";
import { classifyPlan, deriveTripStatus, hasCompletedTrip, ROUTE_OPTIMIZED_ONCE_KEY, type PlanBadge, type TripStatus } from "@/lib/tripStatus";
import { trackFeatureEvent } from "@/lib/trackFeatureEvent";
import { colorForId } from "@/lib/placeStyle";
import type { SavedPlan } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// The global App Bar (hamburger + title + Sheet nav) already lives in
// src/components/AppBar.tsx, rendered once by src/app/(app)/layout.tsx
// above every screen in this group — this page owns only the content
// below it, not another header.
//
// 리디자인 Phase 1(docs/design/2026-08-redesign) — "안녕하세요 + 메뉴 5개"
// 였던 홈을 사용자 상태 기반으로 바꿨다. 메뉴 카드 5개는 완전히 뺐다(내비게
// 이션은 기존 상단바/사이드시트가 이미 담당 — IA 자체를 다시 짜는 건 #167과
// 묶일 Phase 2 몫). 온보딩(V3 웰컴→V2 취향퀴즈→V1 코치마크 전체 흐름)은
// 이번 PR 범위 밖(별도 PR로 진행하기로 합의) — "완전 신규" 히어로는 그 전까지
// AI 코스/직접 계획 버튼 2개짜리 축약판으로만 처리한다.
export function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [homeQuery, setHomeQuery] = useState("");
  const nickname = session?.user?.nickname;

  const submitHomeSearch = () => {
    const trimmed = homeQuery.trim();
    if (!trimmed) return;
    router.push(`/discover?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6 lg:max-w-5xl xl:max-w-6xl">
        <HomeHero nickname={nickname} />
        <QuickLinksRow />

        {/* ── HOME SEARCH ── 바로 검색어를 치면 /discover로 넘어가 그 검색을
            이어서 실행. discover 페이지의 ?q= 복원 로직을 그대로 탄다.
            칩은 "실제 동작하는 것만" 원칙(작업지시서 2-3) — AI 코스는 /course로
            바로 연결되는 실제 기능이라 남겼고, 목업의 "인스타 핫플"·"지금 문
            연 곳"·"내 주변"은 대응하는 화면/트리거가 없어(내 주변은 discover
            검색 결과 안의 정렬 옵션일 뿐 독립된 진입점이 아님) 뺐다. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitHomeSearch();
          }}
          className="relative mb-3"
        >
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={homeQuery}
            onChange={(e) => setHomeQuery(e.target.value)}
            placeholder="여행지, 맛집, 숙소를 검색해보세요"
            className="h-14 rounded-2xl border-slate-200/70 bg-white pl-11 text-[15px] shadow-sm dark:border-slate-800 dark:bg-slate-900"
          />
        </form>
        <div className="mb-8 flex flex-wrap gap-2">
          <Link
            href="/course"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-600/20 dark:bg-brand-600/10 dark:text-brand-400"
          >
            <Sparkles size={13} /> AI 코스 추천
          </Link>
        </div>

        <OnboardingStepper />
        <TripListSection />
        <LatestFeedSection />
      </div>
    </div>
  );
}

interface HeroActiveState {
  kind: "active";
  trip: TripStatus;
}
interface HeroReturningState {
  kind: "returning";
  lastPlan: SavedPlan;
}
interface HeroNewState {
  kind: "new";
}
type HeroState = HeroActiveState | HeroReturningState | HeroNewState;

/**
 * 홈 히어로의 3가지 사용자 상태 — 작업지시서 Phase 1(2-1). store는
 * localStorage에서 채워지므로 마운트 후에만 읽는다(hydration mismatch
 * 회피) — 마운트 전엔 null을 돌려주고, 호출부가 SSR과 동일한 자리표시자를
 * 보여준다.
 */
function useHeroState(): HeroState | null {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const savedPlans = useItineraryStore((s) => s.savedPlans);
  const items = useItineraryStore((s) => s.items);
  const currentCity = useItineraryStore((s) => s.currentCity);

  if (!mounted) return null;

  const trip = deriveTripStatus(savedPlans, items, currentCity);
  if (trip) return { kind: "active", trip };

  if (hasCompletedTrip(savedPlans)) {
    const lastPlan = savedPlans
      .filter((p) => classifyPlan(p) === "completed")
      .sort((a, b) => b.savedAt - a.savedAt)[0];
    return { kind: "returning", lastPlan };
  }

  return { kind: "new" };
}

/**
 * 임시 바로가기 한 줄 — Phase 1이 메뉴 카드 5개(사실상 메인 내비게이션)를
 * 없애면서, 정식 대체 내비게이션(탭바/상단바)이 들어오는 Phase 2 전까지
 * 재방문 사용자가 보관함·커뮤니티 등으로 갈 방법이 햄버거 메뉴뿐이었다
 * (#173 검증 지적 — "재방문 사용자에게 명백한 후퇴"). 카드가 아니라 텍스트
 * 링크 한 줄이라 "메뉴판" 회귀는 아니고, Phase 2에서 정식 내비게이션이
 * 들어오면 이 컴포넌트만 지우면 된다. 신규 사용자에게는 숨긴다 — 그
 * 상태는 CTA 2개(AI 코스/직접 계획)에 시선을 집중시키는 게 목적이라, 아직
 * 갈 곳도 없는 보관함 링크를 보여줘봐야 산만하기만 하다.
 */
function QuickLinksRow() {
  const state = useHeroState();
  if (!state || state.kind === "new") return null;

  const links: { href: string; label: string }[] = [
    { href: "/planner", label: "계획" },
    { href: "/scrapbook", label: "보관함" },
    { href: "/feed", label: "후기 피드" },
    { href: "/community", label: "커뮤니티" },
  ];
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-slate-500 dark:text-slate-400">
      {links.map((l, i) => (
        <span key={l.href} className="flex items-center gap-2">
          {i > 0 && <span className="text-slate-300 dark:text-slate-700" aria-hidden>·</span>}
          <Link href={l.href} className="font-medium hover:text-brand-600">
            {l.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

/**
 * 히어로 — 그라데이션 배경/스카이라인 삽화는 상태와 무관하게 고정, 안의
 * 텍스트·CTA만 사용자 상태에 따라 바뀐다. 각 CTA 클릭은 `home_hero_cta`로
 * 계측한다(#169 인프라 재사용) — 개편 전후 전환율을 비교하기 위함.
 */
function HomeHero({ nickname }: { nickname?: string | null }) {
  const router = useRouter();
  const state = useHeroState();
  const setActiveDate = useItineraryStore((s) => s.setActiveDate);
  const loadPlan = useItineraryStore((s) => s.loadPlan);
  const startNewPlan = useItineraryStore((s) => s.startNewPlan);

  const fireCta = (target: string) => trackFeatureEvent("home_hero_cta", "home", { state: state?.kind ?? "loading", target });

  const goToPlan = (trip: TripStatus) => {
    fireCta("resume_plan");
    if (trip.planId) loadPlan(trip.planId);
    setActiveDate(trip.dayDate);
    suppressStaleActiveDateCorrection();
    router.push("/planner");
  };
  const goToNewPlan = () => {
    fireCta("new_plan");
    startNewPlan();
    router.push("/planner");
  };
  const goToCourse = () => {
    fireCta("ai_course");
    router.push("/course");
  };
  const goToDiscover = () => {
    fireCta("discover");
    router.push("/discover");
  };

  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-blue-700 to-sky-700 shadow-sm">
      <div className="relative z-10 px-6 pb-5 pt-7 sm:px-8 sm:pt-9">
        {!state && (
          // SSR과 동일한 자리표시자 — hydration mismatch 회피.
          <>
            <h1 className="max-w-[70%] text-2xl font-bold tracking-tight text-white sm:max-w-[60%] sm:text-3xl">
              {nickname ? `안녕하세요, ${nickname}님` : "안녕하세요"}
            </h1>
            <p className="mt-1 max-w-[70%] text-[13px] text-blue-50 sm:max-w-[60%] sm:text-sm">오늘은 어디로 떠나볼까요?</p>
          </>
        )}

        {state?.kind === "active" && (
          <>
            <h1 className="max-w-[80%] text-2xl font-bold tracking-tight text-white sm:max-w-[65%] sm:text-3xl">
              {nickname ? `${nickname}님, ` : ""}
              {state.trip.city} 여행{" "}
              {state.trip.kind === "ongoing" ? "중이에요" : `${state.trip.daysUntil}일 남았어요`}
            </h1>
            <p className="mt-1 max-w-[80%] text-[13px] text-blue-50 sm:max-w-[65%] sm:text-sm">
              {state.trip.kind === "ongoing"
                ? `오늘, Day ${state.trip.dayNumber} 일정을 확인해보세요`
                : `Day ${state.trip.dayNumber}을 마저 짜볼까요? · ${state.trip.stopCount}곳 담김`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => goToPlan(state.trip)}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-blue-900 transition-colors hover:bg-blue-50"
              >
                {state.trip.kind === "ongoing" ? "오늘 일정 보기" : "이어서 짜기"} <ChevronRight size={14} />
              </button>
              <button
                onClick={goToNewPlan}
                className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3.5 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
              >
                새 여행 시작
              </button>
            </div>
          </>
        )}

        {state?.kind === "returning" && (
          <>
            <h1 className="max-w-[80%] text-2xl font-bold tracking-tight text-white sm:max-w-[65%] sm:text-3xl">
              다음 여행은 어디로 떠날까요?
            </h1>
            <p className="mt-1 max-w-[80%] text-[13px] text-blue-50 sm:max-w-[65%] sm:text-sm">
              최근 여행: {state.lastPlan.currentCity} · {state.lastPlan.items.length}곳 다녀왔어요
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={goToNewPlan}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-blue-900 transition-colors hover:bg-blue-50"
              >
                새 여행 만들기 <ChevronRight size={14} />
              </button>
              <button
                onClick={goToCourse}
                className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3.5 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
              >
                <Sparkles size={13} /> AI 코스
              </button>
            </div>
          </>
        )}

        {state?.kind === "new" && (
          <>
            <h1 className="max-w-[80%] text-2xl font-bold tracking-tight text-white sm:max-w-[65%] sm:text-3xl">
              {nickname ? `안녕하세요, ${nickname}님` : "안녕하세요"}
            </h1>
            <p className="mt-1 max-w-[80%] text-[13px] text-blue-50 sm:max-w-[65%] sm:text-sm">
              첫 여행 계획, AI 추천으로 시작할까요, 직접 짜볼까요?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={goToCourse}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-blue-900 transition-colors hover:bg-blue-50"
              >
                <Sparkles size={13} /> AI 코스 추천받기
              </button>
              <button
                onClick={goToDiscover}
                className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3.5 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
              >
                직접 계획 짜기 <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* 스카이라인은 실제 문서 흐름에 둬서 자기 높이를 스스로 확보한다
          (absolute면 부모 높이를 수동으로 계산해야 함) — 인물은 그 위에
          absolute로 겹쳐 세운다. */}
      <div className="relative">
        <HeroImage src="/brand/hero-skyline.png" alt="" width={1600} height={393} className="block h-auto w-full opacity-90" />
        <HeroImage
          src="/brand/person-ko-600-q85.webp"
          alt=""
          width={362}
          height={600}
          className="pointer-events-none absolute bottom-0 right-3 h-[115%] w-auto object-contain drop-shadow-[0_8px_16px_rgba(15,23,42,0.35)] sm:right-8"
        />
      </div>
    </section>
  );
}

/**
 * 히어로 배경의 스카이라인/인물 컷아웃용 이미지. BrandLogo.tsx와 같은 패턴 —
 * public/brand/에 파일이 없어도 onError로 조용히 사라질 뿐 레이아웃이
 * 깨지지 않는다(장식용 이미지라 대체 텍스트도 필요 없음).
 */
function HeroImage({
  src,
  alt,
  className,
  width,
  height,
}: {
  src: string;
  alt: string;
  className?: string;
  /** 원본 픽셀 치수 — CSS가 실제 표시 크기를 덮어써도, width/height 속성이
      있으면 브라우저가 로드 전에 가로세로 비율을 알아채 그만큼 공간을
      미리 잡아준다(레이아웃 시프트 방지). */
  width: number;
  height: number;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const img = ref.current;
      if (img && img.complete && img.naturalWidth === 0) setFailed(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative brand asset with an onError fallback (mirrors BrandLogo.tsx)
    <img ref={ref} src={src} alt={alt} width={width} height={height} loading="eager" onError={() => setFailed(true)} className={className} />
  );
}

const ONBOARDING_SEEN_KEY = "tradule_onboarding_seen";

interface OnboardingStep {
  n: 1 | 2 | 3 | 4;
  title: string;
  desc: string;
  icon: "search" | "pin" | "trip-route" | "suitcase";
  done: boolean;
}

/**
 * 4단계 온보딩 스테퍼 — 작업지시서 Phase 1(2-2). "저장된 여행 0건인
 * 사용자에게만" 노출(savedPlans.length===0) — 하나라도 저장하면(4단계
 * 완료) 이 조건 자체가 거짓이 되어 자동으로 사라진다(별도 "완료 시 제거"
 * 로직 불필요). 진행 상태는 서버 저장 없이 store(로그인 시 서버 동기화되는
 * savedPlans/items)와 localStorage(3단계, ROUTE_OPTIMIZED_ONCE_KEY) 조합만
 * 으로 판단한다. 아무 단계도 안 했으면 4칸 전부, 하나라도 진행됐으면
 * "다음 할 일" 한 줄로 접는다.
 */
function OnboardingStepper() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [routeOptimizedOnce, setRouteOptimizedOnce] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setDismissed(localStorage.getItem(ONBOARDING_SEEN_KEY) === "1");
      setRouteOptimizedOnce(localStorage.getItem(ROUTE_OPTIMIZED_ONCE_KEY) === "1");
      setMounted(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const savedPlans = useItineraryStore((s) => s.savedPlans);
  const items = useItineraryStore((s) => s.items);
  const savedPlaces = useItineraryStore((s) => s.savedPlaces);

  if (!mounted || dismissed || savedPlans.length > 0) return null;

  const steps: OnboardingStep[] = [
    { n: 1, title: "어디로 갈지 검색", desc: "도시·맛집·명소 무엇이든", icon: "search", done: items.length > 0 || savedPlaces.length > 0 },
    { n: 2, title: "일정에 추가", desc: "지도에 하나씩 담기", icon: "pin", done: items.length > 0 },
    { n: 3, title: "동선 자동 정리", desc: "트레쥴이 순서를 짜줌", icon: "trip-route", done: routeOptimizedOnce },
    { n: 4, title: "저장하고 떠나기", desc: "여행 중에도 이어보기", icon: "suitcase", done: false /* savedPlans>0이면 이 컴포넌트 자체가 안 뜬다 */ },
  ];
  const anyDone = steps.some((s) => s.done);
  const nextStep = steps.find((s) => !s.done) ?? steps[steps.length - 1];

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    setDismissed(true);
  };

  if (anyDone) {
    // 진행 중 — 설명은 이제 필요 없으니 한 줄로 접어서 다음 할 일만 상기시킨다.
    return (
      <section className="mb-8 flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50/70 px-4 py-2 dark:border-brand-600/20 dark:bg-brand-600/10">
        <CordixIcon name={nextStep.icon} size={14} className="shrink-0 text-brand-600" />
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-brand-700 dark:text-brand-400">
          다음 할 일: <b>{nextStep.title}</b> — {nextStep.desc}
        </p>
        <button onClick={dismiss} aria-label="안내 닫기" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-brand-500 hover:bg-white/70 dark:hover:bg-slate-800">
          <X size={12} />
        </button>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles size={15} className="shrink-0 text-brand-600" />
        <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200">Tradule 처음이신가요?</p>
        <p className="text-[12px] text-slate-400">4단계로 첫 여행 계획을 완성해요</p>
        <button onClick={dismiss} aria-label="안내 닫기" className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X size={13} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {steps.map((s) => (
          <div
            key={s.n}
            className={`rounded-2xl border p-3.5 ${s.n === nextStep.n ? "border-brand-200 bg-brand-50 shadow-sm dark:border-brand-600/30 dark:bg-brand-600/10" : "border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900"}`}
          >
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-bold ${
                s.done
                  ? "bg-success-500 text-white"
                  : s.n === nextStep.n
                    ? "bg-gradient-to-br from-brand-600 to-brand-pink-600 text-white"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-800"
              }`}
            >
              {s.done ? <Check size={13} /> : s.n}
            </div>
            <p className="mt-2 text-[13px] font-bold tracking-tight text-slate-900 dark:text-slate-100">{s.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const PLAN_BADGE: Record<PlanBadge, { label: string; className: string }> = {
  ongoing: { label: "진행 중", className: "bg-brand-600 text-white" },
  upcoming: { label: "예정", className: "bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-brand-400" },
  completed: { label: "완료", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  draft: { label: "초안", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

/** 저장된 계획 하나의 상태 배지 — 작업지시서 2-4의 StatusPill. */
function PlanStatusPill({ status }: { status: PlanBadge }) {
  const { label, className } = PLAN_BADGE[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${className}`}>{label}</span>;
}

/** 저장된 계획 카드의 커버 — 첫 스팟 사진을 시도하고, 실패하면 계획 id로
 * 해시한 고정 색 + 워터마크 아이콘으로 대체한다(#163의 카테고리 아이콘
 * 워터마크 폴백과 같은 패턴 — 빈 회색 박스 대신 "의도된 타일"처럼 보이게). */
function PlanCover({ plan }: { plan: SavedPlan }) {
  const [failed, setFailed] = useState(false);
  const firstItemName = plan.items[0]?.name;
  if (!firstItemName || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: colorForId(plan.id) }}>
        <CordixIcon name="suitcase" size={28} stroke="#fff" className="opacity-50" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote Places photo behind our own redirect proxy, same as SpotCard
    <img
      src={`/api/discover/spot-photo?q=${encodeURIComponent(`${firstItemName} ${plan.currentCity}`)}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

/**
 * "내 여행" — 예전 아무 데이터도 없을 때의 시작 CTA와, 진행 중인 초안/관심
 * 장소 타일은 그대로 두되, 가운데의 "저장된 계획: N개" 집계 타일을 실제
 * 계획 목록(커버+상태배지+날짜·스팟 수)으로 바꿨다 — 작업지시서 2-4. store
 * 값은 localStorage에서 오므로 hydration mismatch를 피하기 위해 마운트
 * 후에만 읽는다.
 */
function TripListSection() {
  const router = useRouter();
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
  const startNewPlan = useItineraryStore((s) => s.startNewPlan);
  const loadPlan = useItineraryStore((s) => s.loadPlan);

  if (!mounted) return null;

  const hasAnything = items.length > 0 || savedPlans.length > 0 || savedPlaces.length > 0;
  const earliestItemDate = items.length > 0 ? items.slice().sort((a, b) => a.date.localeCompare(b.date))[0].date : null;
  const VISIBLE_PLANS = 4;
  const visiblePlans = savedPlans.slice(0, VISIBLE_PLANS);

  const openPlan = (plan: SavedPlan) => {
    loadPlan(plan.id);
    router.push("/planner");
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-brand-600 dark:bg-slate-800">
            <CordixIcon name="trip-route" size={17} />
          </span>
          <h2 className="text-xl font-bold tracking-tight">내 여행</h2>
        </div>
        {hasAnything && (
          <button
            onClick={() => {
              startNewPlan();
              router.push("/planner");
            }}
            className="flex shrink-0 items-center gap-1 rounded-full bg-brand-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-800"
          >
            <Plus size={13} /> 새 계획
          </button>
        )}
      </div>

      {hasAnything ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* 진행 중인 계획(초안) — 이어서 하기 */}
            <Link
              href="/planner"
              onClick={() => {
                if (earliestItemDate) {
                  setActiveDate(earliestItemDate);
                  suppressStaleActiveDateCorrection();
                }
              }}
              className="group rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-600">
                <Calendar size={13} /> 진행 중인 계획
              </p>
              <p className="mt-1.5 truncate text-lg font-bold">{items.length > 0 ? currentCity : "새 여행"}</p>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                {items.length > 0 ? `일정 ${items.length}곳 · 이어서 계획하기` : "타임라인이 비어있어요"}
              </p>
              <span className="mt-3 flex items-center gap-0.5 text-[12.5px] font-semibold text-brand-700 group-hover:text-brand-800">
                플래너 열기 <ChevronRight size={14} />
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

          {savedPlans.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-success-600">
                  <CordixIcon name="suitcase" size={13} /> 저장된 계획 {savedPlans.length}개
                </p>
                {savedPlans.length > VISIBLE_PLANS && (
                  <Link href="/scrapbook" className="text-[12px] font-semibold text-brand-600 hover:text-brand-800">
                    전체 보기
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {visiblePlans.map((plan) => {
                  const badge = classifyPlan(plan);
                  const dates = plan.items.map((i) => i.date).sort();
                  return (
                    <button key={plan.id} onClick={() => openPlan(plan)} className="group overflow-hidden rounded-2xl border border-slate-200/70 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                      <div className="relative h-20">
                        <PlanCover plan={plan} />
                        <div className="absolute right-1.5 top-1.5">
                          <PlanStatusPill status={badge} />
                        </div>
                      </div>
                      <div className="px-2.5 py-2">
                        <p className="truncate text-[13px] font-bold text-slate-900 dark:text-slate-100">{plan.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          {dates.length > 0 ? `${formatDateLabel(dates[0])} · ${plan.items.length}곳` : "일정 없음"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 아직 아무 데이터도 없는 첫 방문 — 시작 CTA */
        <Link
          href="/discover"
          className="group flex items-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-6 transition-all hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/60"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-pink-600 text-white shadow-sm">
            <CordixIcon name="trip-route" size={22} stroke="#fff" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">아직 계획 중인 여행이 없어요</span>
            <span className="block text-[12.5px] text-slate-500 dark:text-slate-400">여행 계획짜기에서 장소를 찾아 첫 일정을 만들어보세요</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
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
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-brand-600 dark:bg-slate-800">
            <CordixIcon name="feed-announce" size={17} />
          </span>
          <h2 className="text-xl font-bold tracking-tight">최신 여행 후기</h2>
        </div>
        <Link href="/feed" className="flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-brand-600 hover:text-brand-800">
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
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-pink-500 text-white">
                  <CordixIcon name="feed-announce" size={18} stroke="#fff" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-400">
                  {post.authorImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- OAuth profile image URL
                    <img src={post.authorImage} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-pink-500 text-[9px] font-bold text-white">
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
