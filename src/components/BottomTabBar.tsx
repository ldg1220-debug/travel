"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { NAV_TABS } from "@/lib/navTabs";
import { useItineraryStore } from "@/store/itineraryStore";

/**
 * 모바일 전용(md 이상에서는 AppBar의 인라인 메뉴가 대신한다) 하단 탭바.
 *
 * **버그 이력(2026-08-17)** — 처음엔 `fixed` 대신 `<main>`의 flex 형제로
 * 렌더했다(부모가 `flex h-dvh flex-col`이라 이 바 높이만큼 `<main>`이
 * 자연히 줄어들 거라 기대). 이건 `<main>` 자신이 내부적으로 스크롤할 때만
 * 성립하는데, 실제로는 `<main>`에 `overflow-y-auto`가 없어서 콘텐츠가
 * 넘치면 문서/body가 스크롤됐다 — 그러면 탭바를 포함한 shell 전체가 그냥
 * 문서 안의 한 블록이라, 스크롤할수록 탭바가 화면 밖으로 같이 밀려
 * 올라갔다(실사용 스크린샷으로 확인된 실제 버그). `<main>`에
 * `overflow-y-auto`를 추가하는 대안도 검토했지만, 그러면 모바일 브라우저의
 * "스크롤 시 주소창 자동 숨김"이 document 스크롤에만 반응해서 깨지고,
 * `/planner`가 이미 자기 안에 별도 스크롤 컨테이너(`boardRef`)를 갖고 있어
 * 이중 스크롤 컨테이너가 생기는 문제도 있었다.
 *
 * 그래서 지금은: 실제로 보이는 바는 `fixed inset-x-0 bottom-0`으로 뷰포트에
 * 고정하고(스크롤이 document든 내부 컨테이너든 상관없이 항상 하단에 붙어
 * 있음), 그 바로 위에 똑같은 높이의 투명 스페이서를 flex 형제로 남겨서
 * `<main>`(그리고 `/planner`의 `boardRef` h-full 계산)이 여전히 그만큼
 * 줄어들게 한다 — 페이지마다 padding-bottom을 손으로 보정할 필요가 없다는
 * 원래 의도는 스페이서 쪽에서 유지된다.
 *
 * 각 탭 터치 타겟은 `h-14`(56px) — 375px 화면에 5탭이면 폭도 75px이라
 * 44×44 접근성 기준을 폭·높이 둘 다 여유 있게 넘는다.
 *
 * /planner에서는 완전히 숨기지 않는다 — 처음엔 그렇게 했다가, "탭바가
 * 없으면 뒤로가기 말고는 다른 탭으로 갈 방법이 없어진다"는 지적을 받고
 * 스크롤 방향에 따라 접고 펴는 쪽으로 바꿨다. 접힘 신호는
 * PlannerBoard.tsx가 자기 스크롤 컨테이너에서 계산해 zustand의
 * plannerTabBarHidden(비영속)에 써주고, 여기서는 /planner 경로일 때만
 * 그 값을 읽는다 — 다른 라우트에서는 항상 펼쳐진 채다. 스페이서와 실제
 * 바가 같은 `collapsed` 조건으로 동시에 접혀서, "바는 안 보이는데 빈
 * 공간은 그대로 남는" 어긋남이 생기지 않는다.
 *
 * **Target API 36(Android 16) edge-to-edge 대응(2026-08-23)** — API 36부터
 * `windowOptOutEdgeToEdgeEnforcement`로도 못 빠져나가는 edge-to-edge가
 * 강제된다. `fixed bottom-0`는 화면 물리적 맨 아래(제스처 내비게이션 바
 * 영역까지)에 그대로 붙어버려서, 탭 터치 타겟이 제스처 바 밑에 깔려
 * 눌리지 않거나 잘려 보이는 문제가 생긴다. `env(safe-area-inset-bottom)`
 * 만큼 바(padding-bottom으로) 스페이서(height로) 둘 다 키워서, 탭
 * 자체는 안전 영역 위에 그대로 남고 `<main>`도 그만큼 더 줄어들게
 * 한다 — 웹 브라우저에선 이 값이 항상 0이라 기존 모습 그대로다.
 * `viewport-fit=cover`(layout.tsx)가 먼저 있어야 env()가 실제 값을 준다.
 */
export function BottomTabBar() {
  const pathname = usePathname() ?? "/";
  const isPlanner = pathname.startsWith("/planner");
  const plannerTabBarHidden = useItineraryStore((s) => s.plannerTabBarHidden);
  const collapsed = isPlanner && plannerTabBarHidden;

  return (
    <>
      {/* 레이아웃 공간 확보용 — 시각적으로 안 보이지만 flex 형제 자리를
          차지해 <main>을 실제로 줄여준다. */}
      <div
        aria-hidden
        className="shrink-0 overflow-hidden transition-[height] duration-200 ease-out md:hidden"
        style={{ height: collapsed ? "0px" : "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
      />
      <nav
        aria-label="주요 메뉴"
        className={`fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white transition-[max-height,opacity] duration-200 ease-out md:hidden dark:border-slate-800 dark:bg-slate-900 ${
          collapsed ? "overflow-hidden opacity-0" : "opacity-100"
        }`}
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          maxHeight: collapsed ? "0px" : "calc(5rem + env(safe-area-inset-bottom, 0px))",
        }}
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
    </>
  );
}
