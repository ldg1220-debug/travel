"use client";

import type { BookingProvider } from "@/lib/affiliates";
import { trackFeatureEvent } from "@/lib/trackFeatureEvent";
import { AffiliateDisclosureNote } from "@/components/AffiliateDisclosureNote";

/**
 * 코스 페이지 하단 "이 지역 숙소 보기" — 작업지시서 2026-10-30 "숙소 제휴 링크" §1③. 특정 호텔이 아니라 각 사의 검색 결과 페이지로만 보낸다(추천 아님).
 * 제휴 링크(rel="sponsored")가 하나라도 있을 때만 렌더하고, 제휴 고지 1줄과 클릭 이벤트(lodging_click)를 붙인다.
 */
export function LodgingAffiliateLinks({ region, providers, surface = "course" }: { region: string; providers: BookingProvider[]; surface?: "course" | "planner" }) {
  if (!providers.some((p) => p.isAffiliate)) return null;
  return (
    <section aria-label={`${region} 숙소 보기`} className="mt-8 border-t border-slate-100 pt-4 dark:border-slate-800">
      <p className="mb-1 text-[13px] font-semibold text-slate-700 dark:text-slate-200">{region} 숙소 보기</p>
      <AffiliateDisclosureNote className="mb-2 text-[11px] text-slate-400" />
      <ul className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <li key={p.key}>
            <a
              href={p.url}
              target="_blank"
              rel="sponsored nofollow noreferrer"
              onClick={() => trackFeatureEvent("lodging_click", surface, { provider: p.key, region, day: null, hasDates: false })}
              style={{ color: p.brand, borderColor: `${p.brand}55` }}
              className="inline-flex h-9 items-center rounded-full border bg-white px-3.5 text-[12.5px] font-semibold hover:bg-slate-50 dark:bg-slate-900"
            >
              {p.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
