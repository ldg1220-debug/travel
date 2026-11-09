"use client";

import type { EsimLink } from "@/lib/travelpayoutsEsim";
import { trackFeatureEvent } from "@/lib/trackFeatureEvent";
import { AffiliateDisclosureNote } from "@/components/AffiliateDisclosureNote";

/**
 * 해외 색인 코스 페이지 하단 "해외 데이터 eSIM" — DIRECTION.md 백로그. 각 사 홈페이지로만 보내며(특정 상품 추천 아님)
 * 제휴 고지 1줄과 클릭 이벤트(esim_click)를 붙인다.
 */
export function EsimAffiliateLinks({ region, links }: { region: string; links: EsimLink[] }) {
  if (links.length === 0) return null;
  return (
    <section aria-label={`${region} 여행 eSIM`} className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
      <p className="mb-1 text-[13px] font-semibold text-slate-700 dark:text-slate-200">{region} 여행 데이터 eSIM</p>
      <AffiliateDisclosureNote className="mb-2 text-[11px] text-slate-400" />
      <ul className="flex flex-wrap gap-2">
        {links.map((p) => (
          <li key={p.key}>
            <a
              href={p.url}
              target="_blank"
              rel="sponsored nofollow noopener noreferrer"
              onClick={() => trackFeatureEvent("esim_click", "course", { provider: p.key, region })}
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
