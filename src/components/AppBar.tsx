"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserPlus, Plus, X, Calendar, CalendarRange } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LoginModal } from "@/components/LoginModal";
import { ProfileSheet } from "@/components/ProfileSheet";
import { NotificationBell } from "@/components/NotificationBell";
import { MessageBell } from "@/components/MessageBell";
import { ThemedLogo } from "@/components/BrandLogo";
import { SavePlanModal } from "@/components/SavePlanModal";
import { MonthCalendar } from "@/components/MonthCalendar";
import { useItineraryStore, MAX_SAVED_PLANS } from "@/store/itineraryStore";
import { fetchUserItineraries, reviveAccount } from "@/lib/api";
import { syncPlanToServer } from "@/lib/planSync";
import { formatDateLabel } from "@/lib/timeline";
import { suppressStaleActiveDateCorrection } from "@/lib/plannerSession";
import { NAV_TABS } from "@/lib/navTabs";
import type { SavedPlan } from "@/lib/types";

const PAGE_TITLES: Record<string, string> = {
  "/": "홈",
  "/discover": "어디로 떠나시나요?",
  "/course": "코스 만들기",
  "/scrapbook": "여행 보관함",
  "/saved-places": "관심 장소 보관함",
  "/feed": "후기 피드",
  "/community": "커뮤니티",
  "/messages": "메시지",
  "/my": "MY",
  "/terms": "이용약관",
  "/privacy": "개인정보처리방침",
  "/admin/reports": "신고 관리",
  "/admin": "관리자 대시보드",
  "/admin/users": "관리자 지정",
};

/**
 * Global App Bar — 탭바 도입(2026-08-15, B안) 이후로는 모바일 내비게이션의
 * 주 진입점이 아니다(그건 BottomTabBar가 담당). 여기 남는 건: (1)
 * 데스크톱(md↑) 전용 인라인 메뉴(NAV_TABS 재사용, 모바일에선 안 보임),
 * (2) 항상 보이는 컨텍스트 타이틀(플래너 계획명/날짜, 홈·탐색 워드마크
 * 등), (3) 저장된 계획 스위처(독립 Sheet — 예전 햄버거 서랍에 있던 것과
 * 같은 로직을 트리거만 아이콘 버튼으로 옮김), (4) 초대·메시지·알림
 * 아이콘. 관리자 링크/약관/문의하기/다크모드/로그아웃 같은 계정·설정
 * 성격 항목은 신규 /my 페이지로 이관됐다(별도 PR).
 */
export function AppBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const [loginReason, setLoginReason] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [savedPlansOpen, setSavedPlansOpen] = useState(false);
  // 저장된 계획 미리보기 — 목록에서 계획을 누르면 바로 열지 않고, 그 계획에
  // 일정이 들어있는 날짜만 표시(다른 색 점)한 월간 달력을 먼저 보여준 뒤
  // "세부일정 보기"를 눌러야 실제로 플래너로 이동하게 한다.
  const [previewPlan, setPreviewPlan] = useState<SavedPlan | null>(null);
  const [previewDate, setPreviewDate] = useState<string>("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 탈퇴 유예기간 중 "계정 살리기" — 재로그인만으로는 자동 취소되지 않게
  // 일부러 만든 명시적 진입점이라, 앱 어디서든 보이는 상단 배너에 바로
  // 버튼을 둔다. 성공하면 세션을 다시 불러와 배너가 즉시 사라지게 한다.
  const [reviving, setReviving] = useState(false);
  const handleRevive = async () => {
    setReviving(true);
    try {
      await reviveAccount();
      await updateSession();
    } catch {
      setToast("계정 살리기에 실패했어요. 잠시 후 다시 시도해주세요");
    } finally {
      setReviving(false);
    }
  };

  const activeDate = useItineraryStore((s) => s.activeDate);
  const region = useItineraryStore((s) => s.region);
  const items = useItineraryStore((s) => s.items);
  const currentCity = useItineraryStore((s) => s.currentCity);
  const savedPlans = useItineraryStore((s) => s.savedPlans);
  const activePlanId = useItineraryStore((s) => s.activePlanId);
  const savePlanAs = useItineraryStore((s) => s.savePlanAs);
  const promoteDraftToPlan = useItineraryStore((s) => s.promoteDraftToPlan);
  const loadPlan = useItineraryStore((s) => s.loadPlan);
  const deletePlan = useItineraryStore((s) => s.deletePlan);
  const setActiveDate = useItineraryStore((s) => s.setActiveDate);
  const setPlanRemoteInfo = useItineraryStore((s) => s.setPlanRemoteInfo);
  const hydrateSavedPlansFromServer = useItineraryStore((s) => s.hydrateSavedPlansFromServer);
  const hydrateDraftFromServer = useItineraryStore((s) => s.hydrateDraftFromServer);
  const setDraftRemoteInfo = useItineraryStore((s) => s.setDraftRemoteInfo);
  const openDraft = useItineraryStore((s) => s.openDraft);
  const startNewPlan = useItineraryStore((s) => s.startNewPlan);

  const previewMarkedDates = useMemo(() => new Set((previewPlan?.items ?? []).map((i) => i.date)), [previewPlan]);

  // 계정 기준 계획 동기화 — 저장된 계획은 기존엔 이 브라우저의 로컬 저장소
  // 안에만 있어서, 같은 계정으로 다른 기기에서 로그인해도 안 보였다. 로그인
  // 상태가 되는 순간 한 번, 서버에 저장된 이 계정의 계획들(과 진행 중인
  // 계획 초안)을 가져온다 — 이미 로컬에 있던(동기화된) 건 서버 최신 내용으로
  // 갱신되고, 로컬에 없던 것만 새로 채워진다.
  //
  // 게스트→계정 이관(작업지시서 2026-08-17, "반대 방향") — 위 pull과는 반대
  // 방향으로, 게스트 상태에서 이미 만들어둔 "이름 붙은" 저장 계획들
  // (savedPlans, remoteId 없음 = 이 기기에만 있던 것)은 여기서 먼저 서버로
  // 올려야 한다. 그러지 않으면 hydrateSavedPlansFromServer는 remoteId 없는
  // 항목을 절대 건드리지 않으므로(그 함수 자체 문서 참고) 이 계정에는 영원히
  // 안 보이는 로컬 전용 상태로 남는다 — 로그인하는 순간 작업이 사라진
  // 것처럼 느껴지는 원인. "지금 화면에 열려 있는" 계획/진행 중인 계획
  // 초안은 이 이관 대상에서 제외한다 — 그건 아래 autoSyncTimer 이펙트가
  // session 변화에 반응해 이미 동일한 로그인 시점에 (savePlanAs로 라이브
  // 상태를 먼저 최신화한 뒤) 동기화하므로, 여기서 예전 스냅샷을 따로
  // 올리면 오히려 그 사이의 최신 편집 내용을 놓친 채 덮어쓸 수 있다.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!session?.user || hydratedRef.current) return;
    hydratedRef.current = true;
    const migrateGuestPlans = async () => {
      const state = useItineraryStore.getState();
      const unsynced = state.savedPlans.filter((p) => p.remoteId == null && p.id !== state.activePlanId && p.items.length > 0);
      await Promise.all(
        unsynced.map((p) =>
          syncPlanToServer(p.id, p.region, p.items, p.name, undefined)
            .then(({ id, shareToken }) => setPlanRemoteInfo(p.id, id, shareToken))
            .catch(() => {}),
        ),
      );
    };
    migrateGuestPlans()
      .catch(() => {})
      .finally(() => {
        fetchUserItineraries()
          .then(({ itineraries, draft }) => {
            hydrateSavedPlansFromServer(itineraries);
            hydrateDraftFromServer(draft);
          })
          .catch(() => {});
      });
  }, [session, hydrateSavedPlansFromServer, hydrateDraftFromServer, setPlanRemoteInfo]);

  // 일정 자동 저장 — "계획 저장"을 따로 누르지 않아도, 로그인 상태에서
  // 일정에 장소를 추가/수정/삭제하면 잠시 후 자동으로 서버에 반영해 다른
  // 기기에서도 곧바로 보이게 한다. 이름 붙은 계획이 열려 있으면(activePlanId)
  // 그 계획 자신에게 반영되고, 열려 있지 않으면 "진행 중인 계획" 초안
  // 슬롯에만 반영된다 — 저장된 계획 목록에는 절대 새 항목을 만들지 않는다
  // (그건 오직 "계획 저장"을 명시적으로 눌렀을 때만 생긴다). 관심
  // 장소(savedPlaces)는 이 흐름과 무관 — 오직 일정(items)만 대상.
  const autoSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!session?.user) return;
    const s0 = useItineraryStore.getState();
    if (items.length === 0 && !s0.activePlanId && !s0.draft) return;
    if (autoSyncTimer.current) clearTimeout(autoSyncTimer.current);
    autoSyncTimer.current = setTimeout(() => {
      const state = useItineraryStore.getState();
      if (state.activePlanId) {
        // savePlanAs(name, activePlanId) refreshes that plan's own snapshot
        // in `savedPlans` from the LIVE working itinerary first — without
        // this, a plan loaded via 사이드바/loadPlan and then edited only
        // ever diverges further from its saved-plans list entry, so this
        // would silently keep re-uploading its stale old content instead of
        // what's actually on screen.
        const existingPlan = state.savedPlans.find((p) => p.id === state.activePlanId);
        const name = existingPlan?.name ?? (state.currentCity || "새 여행");
        const planId = state.savePlanAs(name, state.activePlanId);
        if (!planId) return;
        const plan = useItineraryStore.getState().savedPlans.find((p) => p.id === planId);
        if (!plan) return;
        syncPlanToServer(planId, plan.region, plan.items, plan.name, plan.remoteId)
          .then(({ id, shareToken }) => setPlanRemoteInfo(planId, id, shareToken))
          .catch(() => {});
      } else {
        // No plan open — sync the 진행 중인 계획 draft slot only, never a
        // named plan.
        state.syncDraftFromWorkingState();
        const draft = useItineraryStore.getState().draft;
        if (!draft) return;
        syncPlanToServer("draft", draft.region, draft.items, draft.name, draft.remoteId, true)
          .then(({ id, shareToken }) => setDraftRemoteInfo(id, shareToken))
          .catch(() => {});
      }
    }, 1500);
    return () => {
      if (autoSyncTimer.current) clearTimeout(autoSyncTimer.current);
    };
  }, [items, session, setPlanRemoteInfo, setDraftRemoteInfo]);

  const isPlanner = pathname?.startsWith("/planner") ?? false;
  // /planner is the base route; /planner/{shareToken} is the only sub-route.
  const isShared = isPlanner && pathname !== "/planner";
  // `currentCity` is only a best-guess label (set whenever a discover
  // spot/route gets scheduled) and can look stale/arbitrary once a plan has
  // actually been named — once the working itinerary matches a saved plan,
  // show that plan's real name instead.
  const activePlan = savedPlans.find((p) => p.id === activePlanId);
  const plannerHeaderTitle = activePlan?.name ?? currentCity;

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  };

  const handleInvite = async () => {
    if (!session?.user) {
      setLoginReason("일정을 공유하려면 로그인해주세요.");
      setLoginOpen(true);
      return;
    }
    try {
      // Reuse the active plan's own remoteId (if it has one) instead of
      // always inserting a fresh row — otherwise this button alone creates
      // an orphaned duplicate server row every time it's clicked for an
      // already-saved plan, which a later hydration pulls back in as a
      // second copy of the same plan.
      const { id, shareToken } = await syncPlanToServer(
        activePlanId ?? "unsaved-share",
        region,
        items,
        activePlan?.name ?? currentCity,
        activePlan?.remoteId,
      );
      if (activePlan) setPlanRemoteInfo(activePlan.id, id, shareToken);
      const url = `${window.location.origin}/planner/${shareToken}`;
      await navigator.clipboard.writeText(url);
      showToast("초대 링크가 복사되었어요");
    } catch {
      showToast("Failed to create invite link");
    }
  };

  return (
    <>
      {/* Target API 36(Android 16) edge-to-edge 강제 대응(작업지시서
          2026-08-23) — h-14 대신 min-h-14 + padding-top으로 시스템 상태
          표시줄 높이(env(safe-area-inset-top))만큼 바가 아래로 밀리지 않고
          "커지게" 한다(고정 높이에 padding만 얹으면 아이콘이 눌려 보임).
          웹 브라우저에선 이 값이 항상 0이라 기존 모습 그대로다. */}
      <header
        className="sticky top-0 z-40 flex min-h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex min-w-0 items-center gap-1">
          {/* 모바일: 왼쪽 슬롯은 비운다(햄버거 제거, BottomTabBar가 대신함) —
              센터 타이틀이 시각적으로 가운데 오도록 오른쪽 아이콘 폭만큼
              스페이서만 둔다. 데스크톱: 인라인 텍스트 메뉴. */}
          <div className="h-11 w-11 md:hidden" aria-hidden />
          <nav aria-label="주요 메뉴" className="hidden items-center gap-1 md:flex">
            {NAV_TABS.map((tab) => {
              const active = tab.isActive(pathname ?? "/");
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={`flex h-11 items-center rounded-full px-3.5 text-[13.5px] font-semibold transition-colors ${
                    active
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex min-w-0 flex-col items-center">
          {isPlanner ? (
            <>
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
                {formatDateLabel(activeDate)}
                {isShared && " · 공유됨"}
              </span>
              <span className="text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-100">{plannerHeaderTitle}</span>
            </>
          ) : pathname === "/" || pathname === "/discover" ? (
            // 홈/탐색: page-title 대신 워드마크 + 슬로건 (워드마크 굵게, 슬로건 가늘게).
            <Link href="/" className="flex items-baseline gap-2 transition-opacity hover:opacity-80">
              <ThemedLogo form="wordmark" imgClassName="h-11 w-auto" textClassName="text-[30px]" />
              <span className="hidden text-[13px] font-light tracking-wide text-slate-500 min-[400px]:inline dark:text-slate-400">
                당신의 여행 파트너
              </span>
            </Link>
          ) : PAGE_TITLES[pathname ?? ""] ? (
            <span className="text-[15px] font-bold text-slate-900 dark:text-slate-100">{PAGE_TITLES[pathname ?? ""]}</span>
          ) : (
            // /trip/[id], /share/[id] 같은 링크로 바로 들어오는 페이지 —
            // 고정 페이지 타이틀이 없어 예전엔 "트레쥴" 글자만 덩그러니
            // 떴는데, 카카오톡 공유로 처음 들어오는 진입점이기도 하니
            // 브랜드 로고를 그대로 보여준다.
            <Link href="/" className="flex items-baseline gap-2 transition-opacity hover:opacity-80">
              <ThemedLogo form="wordmark" imgClassName="h-10 w-auto" textClassName="text-[26px]" />
            </Link>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setSavedPlansOpen(true)}
            aria-label="저장된 계획"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <CalendarRange size={18} />
          </button>
          {isPlanner && (
            <button
              onClick={handleInvite}
              aria-label="초대하기"
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <UserPlus size={18} />
            </button>
          )}
          {session?.user && (
            <>
              <MessageBell />
              <NotificationBell />
            </>
          )}
        </div>
      </header>

      {/* 저장된 계획 스위처 — 예전엔 햄버거 서랍 안 "계획" 서브메뉴였다.
          트리거만 우측 아이콘 버튼으로 옮기고 내용 로직은 그대로 재사용. */}
      <Sheet open={savedPlansOpen} onOpenChange={setSavedPlansOpen}>
        <SheetContent side="right" className="w-72 dark:border-slate-800 dark:bg-slate-900">
          <SheetHeader>
            <SheetTitle>저장된 계획</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
            {/* 새 계획 — 이전에 뭘 만들다 말았는지 몰라도(또는 신경쓰고
                싶지 않아도) 항상 빈 화면으로 들어갈 수 있는 명시적인
                진입점. 초안(draft)에 뭐가 남아있는지 애매해서 헷갈린다는
                피드백에 따라, "지금 작업 중인 일정 보기"(=이어서 하기)와
                나란히 둬서 고를 수 있게. */}
            <button
              onClick={() => {
                startNewPlan();
                router.push("/planner");
                setSavedPlansOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <Plus size={13} />
              새 계획 시작하기
            </button>
            {/* 계획을 하나도 안 골라도 지금 작업 중인 일정으로는 항상 바로
                갈 수 있게. */}
            <button
              onClick={() => {
                openDraft();
                router.push("/planner");
                setSavedPlansOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <Calendar size={13} />
              지금 작업 중인 일정 보기
            </button>
            {savedPlans.length === 0 ? (
              <button
                onClick={() => {
                  setSaveModalOpen(true);
                  setSavedPlansOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <Plus size={13} />
                계획 저장
              </button>
            ) : (
              savedPlans.map((plan) => (
                <div key={plan.id} className="group flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <button
                    onClick={() => {
                      const firstMarked = plan.items.length > 0
                        ? [...plan.items].map((i) => i.date).sort()[0]
                        : plan.activeDate;
                      setPreviewPlan(plan);
                      setPreviewDate(firstMarked);
                      setSavedPlansOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 py-1.5 text-left"
                  >
                    {activePlanId === plan.id && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success-500" />}
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-600 dark:text-slate-300">{plan.name}</span>
                  </button>
                  {confirmDeleteId === plan.id ? (
                    <div className="flex shrink-0 items-center gap-1.5 pr-1">
                      <button
                        onClick={() => {
                          deletePlan(plan.id);
                          setConfirmDeleteId(null);
                        }}
                        className="text-[11px] font-semibold text-rose-500"
                      >
                        삭제
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] text-slate-400">
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(plan.id)}
                      aria-label={`${plan.name} 삭제`}
                      className="shrink-0 p-1.5 text-slate-300 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                    >
                      <CordixIcon name="trash" size={12} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* 탈퇴 유예기간 중임을 어디서든 바로 알 수 있게 하는 배너 — 로그인만
          하면 자동으로 취소되지 않고(의도적으로), 여기서 명시적으로 "계정
          살리기"를 눌러야만 취소된다. */}
      {session?.user?.deletionRequestedAt && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-3.5 py-2 text-[12px] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <span>
            {session.user.deletionPurgeAt
              ? `${formatDateLabel(session.user.deletionPurgeAt.slice(0, 10))}에 계정이 영구 삭제될 예정이에요`
              : "계정이 삭제 예정이에요"}
          </span>
          <button
            onClick={handleRevive}
            disabled={reviving}
            className="shrink-0 rounded-full bg-rose-600 px-3 py-1 font-semibold text-white transition-opacity hover:bg-rose-700 disabled:opacity-60"
          >
            {reviving ? "처리 중…" : "계정 살리기"}
          </button>
        </div>
      )}

      {loginOpen && <LoginModal reason={loginReason ?? undefined} onClose={() => setLoginOpen(false)} />}

      {/* 가입 직후 닉네임이 없거나 이용약관·개인정보처리방침 동의 기록이 없으면
          앱을 쓰기 전 강제로 설정/동의부터 하게 한다 — 닫기/배경클릭으로 건너뛸
          수 없는 mandatory 모드. (약관 도입 전 기존 가입자도 다음 접속 때 통과) */}
      {session?.user && (session.user.nickname == null || !session.user.termsAgreed) && (
        <ProfileSheet onClose={() => {}} mandatory />
      )}

      {saveModalOpen && (
        <SavePlanModal
          atCap={savedPlans.length >= MAX_SAVED_PLANS}
          savedPlans={savedPlans}
          activePlan={activePlan ?? null}
          onClose={() => setSaveModalOpen(false)}
          onSave={(name, overwriteId) => {
            // "계획 저장"이 진행 중인 계획(초안)에서 눌린 거면 그 내용을 새
            // 계획으로 "전환"(promoteDraftToPlan) — 초안이 비워짐. 이미
            // 열려 있는 이름 붙은 계획을 다른 이름으로 저장/덮어쓰는 경우는
            // 초안과 무관하므로 그냥 savePlanAs.
            const wasOnDraft = useItineraryStore.getState().activePlanId == null;
            const planId = overwriteId ? savePlanAs(name, overwriteId) : wasOnDraft ? promoteDraftToPlan(name) : savePlanAs(name);
            setSaveModalOpen(false);
            showToast(overwriteId ? `"${name}" 덮어썼어요` : `"${name}" 저장됨`);
            // 로그인 상태면 이 계획 전용 서버 행에 동기화 — 다른 기기에서
            // 같은 계정으로 로그인했을 때도 보이도록. remoteId가 이미 있으면
            // 그 행을 갱신(같은 링크 유지), 없으면 새로 만든다.
            if (planId && session?.user) {
              const plan = useItineraryStore.getState().savedPlans.find((p) => p.id === planId);
              if (plan) {
                syncPlanToServer(planId, plan.region, plan.items, plan.name, plan.remoteId)
                  .then(({ id, shareToken }) => setPlanRemoteInfo(planId, id, shareToken))
                  .catch(() => showToast(`"${name}" 서버 동기화에 실패했어요 — 다른 기기에서 안 보일 수 있어요`));
              }
            } else if (planId && !session?.user) {
              showToast(`"${name}" 이 기기에만 저장됐어요 — 다른 기기에서 보려면 로그인해주세요`);
            }
          }}
        />
      )}

      {previewPlan && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPreviewPlan(null)} />
          <div className="relative w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl dark:bg-slate-900">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">{previewPlan.name}</h3>
              <button
                onClick={() => setPreviewPlan(null)}
                aria-label="닫기"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-[12px] text-slate-500 dark:text-slate-400">일정이 있는 날짜에 점이 표시돼요. 날짜를 고르면 그 날부터 보여줘요.</p>
            <MonthCalendar selected={previewDate} onSelect={setPreviewDate} markedDates={previewMarkedDates} accentColor="#943A00" />
            <button
              onClick={() => {
                loadPlan(previewPlan.id);
                setActiveDate(previewDate);
                suppressStaleActiveDateCorrection();
                setPreviewPlan(null);
                router.push("/planner");
              }}
              className="mt-4 h-11 w-full rounded-xl bg-brand-700 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
            >
              세부일정 보기
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900/90 px-3.5 py-2 text-xs text-white">
          {toast}
        </div>
      )}
    </>
  );
}
