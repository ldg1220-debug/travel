"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { NAV_TABS } from "@/lib/navTabs";
import { useItineraryStore } from "@/store/itineraryStore";

/**
 * 모바일 전용(md 이상에서는 AppBar의 인라인 메뉴가 대신한다) 하단 탭바 —
 * 탭바 도입 작업지시서(2026-08-15, B안). `fixed` 대신 (app)/layout.tsx의
 * flex-col 안에서 `<main>`의 형제로 렌더된다 — 부모가 이미 `flex h-dvh
 * flex-col`이라 이 바가 차지하는 높이만큼 `<main>`이 자연히 줄어들고,
 * 페이지마다 `padding-bottom`을 손으로 보정할 필요가 없다.
 *
 * 각 탭 터치 타겟은 `h-14`(56px) — 375px 화면에 5탭이면 폭도 75px이라
 * 44×44 접근성 기준을 폭·높이 둘 다 여유 있게 넘는다.
 *
 * /planner에서는 완전히 숨기지 않는다 — 처음엔 그렇게 했다가, "탭바가
 * 없으면 뒤로가기 말고는 다른 탭으로 갈 방법이 없어진다"는 지적을 받고
 * 스크롤 방향에 따라 접고 펴는 쪽으로 바꿨다. 접힘 신호는
 * PlannerBoard.tsx가 자기 스크롤 컨테이너에서 계산해 zustand의
 * plannerTabBarHidden(비영속)에 써주고, 여기서는 /planner 경로일 때만
 * 그 값을 읽는다 — 다른 라우트에서는 항상 펼쳐진 채다.
 */
export function BottomTabBar() {
  const pathname = usePathname() ?? "/";
  const isPlanner = pathname.startsWith("/planner");
  const plannerTabBarHidden = useItineraryStore((s) => s.plannerTabBarHidden);
  const collapsed = isPlanner && plannerTabBarHidden;

  return (
    <nav
      aria-label="주요 메뉴"
      className={`grid shrink-0 grid-cols-5 border-t border-slate-200 bg-white transition-[max-height,opacity] duration-200 ease-out md:hidden dark:border-slate-800 dark:bg-slate-900 ${
        collapsed ? "max-h-0 overflow-hidden opacity-0" : "max-h-20 opacity-100"
      }`}
    >
      {NAV_TABS.map((tab) => {
        const active = tab.isActive(pathname);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium ${
              active ? "text-brand-700 dark:text-brand-400" : "text-slate-400 dark:text-slate-500"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {tab.icon ? (
              <CordixIcon name={tab.icon} size={20} stroke="currentColor" accent="currentColor" />
            ) : (
              <Home size={20} strokeWidth={active ? 2.3 : 1.8} />
            )}
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
