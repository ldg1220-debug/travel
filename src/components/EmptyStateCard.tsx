import type { ReactNode } from "react";

/**
 * 공용 빈 상태 패널 — 스크랩북 모티프 작업지시서(2026-08-14, 파트 B) B-3.
 * 커뮤니티/여행 보관함/discover 폴백/플래너 관심 장소 패널, 4곳에 적용한다.
 * `title`은 손글씨 폰트(`font-handwriting`, layout.tsx에서 로드하는 Gaegu)
 * 로 그린다 — B-4 규칙대로 빈 상태 헤드라인 전용이고, 본문 성격인
 * `subtitle`은 일반 폰트 그대로 둔다.
 */
export function EmptyStateCard({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-warm-hairline bg-warm-surface-alt/60 py-20 text-center dark:border-slate-800 dark:bg-slate-900/40">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warm-surface text-brand-600 ring-1 ring-warm-hairline dark:bg-slate-800 dark:text-brand-400 dark:ring-slate-700">
        {icon}
      </span>
      <p className="font-handwriting text-2xl leading-none text-warm-ink dark:text-slate-100">{title}</p>
      {subtitle && <p className="mt-2.5 text-[13px] text-warm-ink-3 dark:text-slate-400">{subtitle}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-full bg-brand-700 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-800"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
