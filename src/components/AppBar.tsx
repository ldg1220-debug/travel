"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Menu, Search, Calendar, Book, Heart, UserPlus, Sparkles, Plus, Trash2, ChevronDown, LogIn, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LoginModal } from "@/components/LoginModal";
import { ThemedLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SavePlanModal } from "@/components/SavePlanModal";
import { useItineraryStore, MAX_SAVED_PLANS } from "@/store/itineraryStore";
import { saveItinerary } from "@/lib/api";
import { formatDateLabel } from "@/lib/timeline";

// 일정(계획)과는 완전히 분리된 두 개의 보관함: 다녀온 여행 보관함(지난
// itinerary/trip 기록, /scrapbook)과 관심 장소 보관함(찜해둔 개별 장소,
// /saved-places) — 후자는 하단에 독립된 탭으로 별도 배치.
// 코스 만들기는 여행 계획짜기의 하위 플로우(지역 고르고 코스 조립)라서
// 최상위 탭이 아니라 여행 계획짜기 아래 서랍(sub-item)으로 들어간다.
interface NavItem {
  href: string;
  label: string;
  icon: typeof Search;
  sub?: { href: string; label: string; icon: typeof Search }[];
}
const NAV_ITEMS: NavItem[] = [
  { href: "/discover", label: "여행 계획짜기", icon: Search, sub: [{ href: "/course", label: "코스 만들기", icon: Sparkles }] },
  { href: "/planner", label: "계획", icon: Calendar },
  { href: "/scrapbook", label: "다녀온 여행 보관함", icon: Book },
];
const SAVED_PLACES_NAV_ITEM = { href: "/saved-places", label: "관심 장소 보관함", icon: Heart };

const PAGE_TITLES: Record<string, string> = {
  "/": "홈",
  "/discover": "어디로 떠나시나요?",
  "/course": "코스 만들기",
  "/scrapbook": "다녀온 여행 보관함",
  "/saved-places": "관심 장소 보관함",
};

/**
 * Global App Bar for the /discover, /planner, /scrapbook screens (see
 * src/app/(app)/layout.tsx) — a hamburger menu opens a left-side Sheet
 * listing all three, and the center/right slots adapt to whichever one is
 * active. Only /planner has anything worth inviting a collaborator to, so
 * the invite button (and the handleInvite logic it drives) only appears
 * there.
 */
export function AppBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginReason, setLoginReason] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDate = useItineraryStore((s) => s.activeDate);
  const region = useItineraryStore((s) => s.region);
  const items = useItineraryStore((s) => s.items);
  const currentCity = useItineraryStore((s) => s.currentCity);
  const savedPlans = useItineraryStore((s) => s.savedPlans);
  const activePlanId = useItineraryStore((s) => s.activePlanId);
  const savePlanAs = useItineraryStore((s) => s.savePlanAs);
  const loadPlan = useItineraryStore((s) => s.loadPlan);
  const deletePlan = useItineraryStore((s) => s.deletePlan);

  const isPlanner = pathname?.startsWith("/planner") ?? false;
  // /planner is the base route; /planner/{shareToken} is the only sub-route.
  const isShared = isPlanner && pathname !== "/planner";

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
      const { shareToken } = await saveItinerary(region, items);
      const url = `${window.location.origin}/planner/${shareToken}`;
      await navigator.clipboard.writeText(url);
      showToast("초대 링크가 복사되었어요");
    } catch {
      showToast("Failed to create invite link");
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="메뉴"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Menu size={20} />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 dark:border-slate-800 dark:bg-slate-900">
            <SheetHeader>
              <div className="flex items-center justify-between pr-8">
                <SheetTitle>
                  <Link href="/" onClick={() => setMenuOpen(false)} className="flex items-baseline gap-1.5 transition-opacity hover:opacity-80">
                    {/* compact header → lettering-only wordmark (the full graffiti emblem lives on roomy surfaces: splash/login) */}
                    <ThemedLogo form="wordmark" imgClassName="h-10 w-auto" textClassName="text-2xl" />
                  </Link>
                </SheetTitle>
                <ThemeToggle />
              </div>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-2">
              {NAV_ITEMS.map(({ href, label, icon: Icon, sub }) => {
                const active = pathname?.startsWith(href) ?? false;
                const isPlan = href === "/planner";
                return (
                  <div key={href}>
                    <div className="flex items-center gap-0.5">
                      <Link
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                          active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                        }`}
                      >
                        <Icon size={17} />
                        {label}
                      </Link>
                      {/* 저장된 계획 서랍 토글 — 계획 탭 자체는 그대로 이동(navigate)하고,
                          이 화살표만 목록을 펼치거나 접는다. */}
                      {isPlan && (
                        <button
                          onClick={() => setPlansOpen((v) => !v)}
                          aria-label={plansOpen ? "저장된 계획 접기" : "저장된 계획 펼치기"}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        >
                          <ChevronDown size={15} className={`transition-transform ${plansOpen ? "" : "-rotate-90"}`} />
                        </button>
                      )}
                    </div>

                    {/* 저장된 계획 — 여러 트립 초안을 이름 붙여 저장해두고 전환/비교할
                        수 있는 스위처. 서랍처럼 화살표로 펼치고 접는다. */}
                    {isPlan && plansOpen && (
                      <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-slate-100 dark:border-slate-800 pl-3">
                        {savedPlans.length === 0 ? (
                          <button
                            onClick={() => {
                              setSaveModalOpen(true);
                              setMenuOpen(false);
                            }}
                            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                          >
                            <Plus size={13} />
                            계획 저장
                          </button>
                        ) : (
                          savedPlans.map((plan) => (
                            <div key={plan.id} className="group flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-slate-50">
                              <button
                                onClick={() => {
                                  loadPlan(plan.id);
                                  setMenuOpen(false);
                                  router.push("/planner");
                                }}
                                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 py-1.5 text-left"
                              >
                                {activePlanId === plan.id && (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                )}
                                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-600">
                                  {plan.name}
                                </span>
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
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* 하위 플로우 링크 (예: 여행 계획짜기 → 코스 만들기) — 항상 펼쳐진 서랍 */}
                    {sub && (
                      <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-slate-100 dark:border-slate-800 pl-3">
                        {sub.map(({ href: subHref, label: subLabel, icon: SubIcon }) => {
                          const subActive = pathname?.startsWith(subHref) ?? false;
                          return (
                            <Link
                              key={subHref}
                              href={subHref}
                              onClick={() => setMenuOpen(false)}
                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition-colors ${
                                subActive
                                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                              }`}
                            >
                              <SubIcon size={14} />
                              {subLabel}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* 관심 장소 보관함 — 일정/여행 기록과는 무관한 개별 찜 목록이라
                위 메뉴와 구분선으로 분리된 독립 탭으로 하단에 배치. */}
            <div className="mt-2 border-t border-slate-100 dark:border-slate-800 px-2 pt-2">
              <Link
                href={SAVED_PLACES_NAV_ITEM.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  (pathname?.startsWith(SAVED_PLACES_NAV_ITEM.href) ?? false)
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <SAVED_PLACES_NAV_ITEM.icon size={17} />
                {SAVED_PLACES_NAV_ITEM.label}
              </Link>
            </div>

            {/* 계정 — 로그아웃 상태면 로그인/회원가입 진입, 로그인 상태면
                프로필 + 로그아웃. mt-auto 로 서랍 맨 아래에 고정. */}
            <div className="mt-auto border-t border-slate-100 dark:border-slate-800 px-2 pb-2 pt-3">
              {session?.user ? (
                <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
                    {(session.user.name ?? session.user.email ?? "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{session.user.name ?? "여행자"}</p>
                    {session.user.email && <p className="truncate text-[11px] text-slate-400">{session.user.email}</p>}
                  </div>
                  <button
                    onClick={() => signOut()}
                    aria-label="로그아웃"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setLoginReason(null);
                    setLoginOpen(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  <LogIn size={17} />
                  로그인 / 회원가입
                </button>
              )}
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-col items-center">
          {isPlanner ? (
            <>
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
                {formatDateLabel(activeDate)}
                {isShared && " · 공유됨"}
              </span>
              <span className="text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-100">{currentCity}</span>
            </>
          ) : pathname === "/" || pathname === "/discover" ? (
            // 홈/탐색: page-title 대신 워드마크 + 슬로건 (워드마크 굵게, 슬로건 가늘게).
            <Link href="/" className="flex items-baseline gap-2 transition-opacity hover:opacity-80">
              <ThemedLogo form="wordmark" imgClassName="h-7 w-auto" glow={false} textClassName="text-[19px]" />
              <span className="hidden text-[11px] font-light tracking-wide text-slate-500 min-[400px]:inline dark:text-slate-400">
                당신의 여행 파트너
              </span>
            </Link>
          ) : (
            <span className="text-[15px] font-bold text-slate-900 dark:text-slate-100">{PAGE_TITLES[pathname ?? ""] ?? "트레쥴"}</span>
          )}
        </div>

        {isPlanner ? (
          <button
            onClick={handleInvite}
            aria-label="초대하기"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <UserPlus size={18} />
          </button>
        ) : (
          <div className="h-9 w-9" aria-hidden />
        )}
      </header>

      {loginOpen && <LoginModal reason={loginReason ?? undefined} onClose={() => setLoginOpen(false)} />}

      {saveModalOpen && (
        <SavePlanModal
          atCap={savedPlans.length >= MAX_SAVED_PLANS}
          onClose={() => setSaveModalOpen(false)}
          onSave={(name) => {
            savePlanAs(name);
            setSaveModalOpen(false);
            showToast(`"${name}" 저장됨`);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900/90 px-3.5 py-2 text-xs text-white">
          {toast}
        </div>
      )}
    </>
  );
}
