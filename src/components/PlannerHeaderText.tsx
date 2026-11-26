"use client";

import { useIsClient } from "@/lib/useIsClient";

/**
 * 상단바 가운데 날짜 줄 + 계획 이름 줄.
 * 날짜("오늘" 기준 — 서버 UTC / 브라우저 로컬)와 계획 이름(localStorage)은
 * 서버와 브라우저에서 글자가 달라지므로, 마운트 전(서버 렌더·하이드레이션
 * 첫 렌더)에는 같은 높이의 빈 자리만 그려 React #418 을 피한다.
 */
export function PlannerHeaderText({ dateLabel, title }: { dateLabel: string; title: string }) {
  const isClient = useIsClient();
  return (
    <>
      <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
        {isClient ? dateLabel : " "}
      </span>
      <span className="text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-100">
        {isClient ? title : " "}
      </span>
    </>
  );
}
