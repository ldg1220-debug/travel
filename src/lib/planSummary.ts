import { flatRegions } from "@/lib/discoverData";
import type { SavedPlan } from "@/lib/types";

/**
 * 저장된 계획 목록의 항목 요약 — 작업지시서 2026-10-30 "저장된 계획 목록에 날짜·정보 표시".
 * 2줄째: 여행 날짜(10/24~10/26 · 3일) 또는 "날짜 미정 · 3일차까지" · 지역 · 장소 N곳 · "수정 10/19". 지난 여행(마지막 날 < 오늘)은 흐리게 + "지난 여행" 라벨.
 */
export interface PlanListSummary {
  /** "10/24~10/26 · 3일" 또는 "날짜 미정 · 3일차까지" 또는 "일정 없음" */
  dateText: string;
  regionText: string;
  placeCountText: string;
  updatedText: string;
  /** 만든 날 — 서버에서 받아 온 계획만("만든 날 10/19"), 모르면 null. */
  createdText: string | null;
  past: boolean;
}

const md = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
};
const msToMd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const dayDiffInclusive = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

let regionNames: string[] | null = null;
function knownRegionNames(): string[] {
  if (!regionNames) regionNames = [...flatRegions("domestic"), ...flatRegions("overseas")].map((r) => r.name).sort((a, b) => b.length - a.length);
  return regionNames;
}

/** 지역 이름 — 계획의 도시 표기(currentCity)가 있으면 그것, 없으면 제목에 들어 있는 알려진 지역 이름, 그것도 없으면 국내/해외. */
export function planRegionText(plan: Pick<SavedPlan, "name" | "currentCity" | "region">): string {
  const city = plan.currentCity?.trim();
  if (city && city !== "새 여행") return city;
  const fromTitle = knownRegionNames().find((n) => plan.name.includes(n));
  if (fromTitle) return fromTitle;
  return plan.region === "domestic" ? "국내" : "해외";
}

export function summarizePlanForList(plan: Pick<SavedPlan, "name" | "items" | "currentCity" | "region" | "savedAt" | "createdAt">, today: string): PlanListSummary {
  const dates = [...new Set(plan.items.map((i) => i.date))].sort();
  const undated = plan.items.some((i) => i.dayNumber != null);
  let dateText: string;
  let past = false;
  if (plan.items.length === 0) {
    dateText = "일정 없음";
  } else if (undated) {
    const last = Math.max(...plan.items.map((i) => i.dayNumber ?? 0), dates.length);
    dateText = `날짜 미정 · ${last}일차까지`;
  } else {
    const first = dates[0];
    const last = dates[dates.length - 1];
    dateText = first === last ? `${md(first)} · 1일` : `${md(first)}~${md(last)} · ${dayDiffInclusive(first, last)}일`;
    past = last < today;
  }
  return {
    dateText,
    regionText: planRegionText(plan),
    placeCountText: `장소 ${plan.items.length}곳`,
    updatedText: `수정 ${msToMd(plan.savedAt)}`,
    createdText: plan.createdAt != null ? `만든 날 ${msToMd(plan.createdAt)}` : null,
    past,
  };
}
