"use client";

import { useRouter } from "next/navigation";

const SEGMENTS = [
  { key: "feed", label: "후기 피드", href: "/feed" },
  { key: "community", label: "커뮤니티", href: "/community" },
] as const;

/**
 * `/feed`·`/community`를 시각적으로만 묶는 2-way 세그먼트 컨트롤 — 탭바
 * 도입 작업지시서(2026-08-15, B안)의 "커뮤니티 탭은 두 라우트를
 * 세그먼트로 묶되 라우트는 유지" 지침. 라우트/화면 컴포넌트는 그대로
 * 두고 각 파일 제목 행 위에 이 한 줄만 얹는다. 전환은 일반 페이지
 * 이동(router.push)이라 모달류에서 쓰는 `useBackButtonClose` 같은 별도
 * 히스토리 로직이 필요 없다 — 뒤로가기를 누르면 그냥 이전 세그먼트로
 * 돌아간다(일반 라우트 이동과 동일한 브라우저 기본 동작).
 */
export function CommunitySegmentTabs({ current }: { current: "feed" | "community" }) {
  const router = useRouter();

  return (
    <div className="mb-4 flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="후기 피드 · 커뮤니티">
      {SEGMENTS.map((s) => {
        const active = s.key === current;
        return (
          <button
            key={s.key}
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) router.push(s.href);
            }}
            className={`flex-1 rounded-full py-1.5 text-[13px] font-semibold transition-colors ${
              active
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
