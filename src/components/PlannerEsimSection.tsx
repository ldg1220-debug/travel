"use client";

import { EsimAffiliateLinks } from "@/components/EsimAffiliateLinks";
import { OVERSEAS_LOCALITY_NAMES } from "@/lib/discoverData";
import { esimAffiliateLinks } from "@/lib/travelpayoutsEsim";

/** 계획 도시가 해외(코스 페이지의 `resolveScope(city) !== "domestic"` 와 같은 기준)일 때만 true. 도시 미정이면 false. */
export function isOverseasPlanCity(city: string | null | undefined): boolean {
  return !!city && OVERSEAS_LOCALITY_NAMES.has(city);
}

/** 계획 화면 본문 — 해외 계획에만 데이터 eSIM 링크(각 사 홈페이지, sub_id=planner_esim, esim_click surface=planner). */
export function PlannerEsimSection({ city }: { city: string | null | undefined }) {
  if (!city || !isOverseasPlanCity(city)) return null;
  return (
    <div className="px-4 pb-1 pt-1">
      <EsimAffiliateLinks region={city} links={esimAffiliateLinks("planner_esim")} surface="planner" className="rounded-2xl border border-slate-100 px-4 py-3 dark:border-slate-800" />
    </div>
  );
}
