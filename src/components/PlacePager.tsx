"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow } from "@/lib/pagination";

/** Numbered pager (◀ 1 … 4 5 6 … 12 ▶) for a client-side-paginated place list — the whole list is already fetched, so "page" just slices it and this only ever needs `totalPages`, no server round-trip. */
export function PlacePager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="이전 페이지"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 disabled:opacity-30 dark:border-slate-700 dark:text-slate-400"
      >
        <ChevronLeft size={14} />
      </button>
      {pageWindow(page, totalPages).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-[12px] text-slate-300 dark:text-slate-600">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-[12.5px] font-semibold tabular-nums transition-colors ${
              p === page ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        aria-label="다음 페이지"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 disabled:opacity-30 dark:border-slate-700 dark:text-slate-400"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
