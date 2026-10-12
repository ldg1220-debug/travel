import type { CourseDays } from "./server/courseBrief";
import { DOMESTIC_LOCALITY_NAMES, flatRegions, resolveRegionAlias, styleForRegion } from "./discoverData";

/**
 * 지역별 "실제로 많이 가는 일수" — 작업지시서 2026-10-13 "지역마다 실제로 많이 가는 일수를 대표로".
 * 코타키나발루 2박3일처럼 수요 없는 짧은 일수가 허브·인기 코스·사이트맵에서 대표처럼 앞서지 않게, 앞에 내세울
 * 일수(앞쪽이 더 대표)를 지역마다 정한다. 값은 CourseDays(7 = 라벨 "5박7일"). 페이지 자체는 없애지 않는다 —
 * 대표 아닌 일수는 "다른 일수"로 접힐 뿐이다. 라벨 표기(3박5일 vs 4박5일)는 이 표와 무관하며 이번에 바꾸지 않는다.
 */
const RESORT_DEFAULT: readonly CourseDays[] = [7, 6, 5];
const CITY_DEFAULT: readonly CourseDays[] = [3, 2, 4];
const DOMESTIC_DEFAULT: readonly CourseDays[] = [2, 1, 3];
const JEJU: readonly CourseDays[] = [3, 2, 4];

const OVERRIDES: Readonly<Record<string, readonly CourseDays[]>> = {
  코타키나발루: [7, 6, 5],
  세부: [7, 6, 5],
  보라카이: [7, 6, 5],
  푸꾸옥: [7, 6, 5],
  냐짱: [7, 6, 5],
  발리: [7, 6, 5],
  다낭: [5, 4, 3],
  오키나와: [5, 4, 3],
  괌: [5, 4, 3],
  사이판: [5, 4, 3],
  오사카: [3, 4, 2],
  도쿄: [3, 4, 2],
  후쿠오카: [3, 4, 2],
  방콕: [3, 4, 2],
  타이베이: [3, 4, 2],
};

let jejuNames: Set<string> | null = null;
function isJeju(region: string): boolean {
  if (!jejuNames) {
    jejuNames = new Set(["제주", "제주도"]);
    for (const r of flatRegions("domestic")) if (r.parent === "제주" || r.parent === "제주도") jejuNames.add(r.name);
  }
  return jejuNames.has(region);
}

/** 앞쪽일수록 대표. 표에 없는 지역은 스타일 기본값(휴양형 [7,6,5] · 도시형 [3,2,4] · 국내 [2,1,3] · 제주 [3,2,4]). */
export function regionTypicalDays(region: string): readonly CourseDays[] {
  const name = resolveRegionAlias(region);
  const override = OVERRIDES[name];
  if (override) return override;
  if (isJeju(name)) return JEJU;
  if (DOMESTIC_LOCALITY_NAMES.has(name)) return DOMESTIC_DEFAULT;
  return styleForRegion(name) === "resort" ? RESORT_DEFAULT : CITY_DEFAULT;
}

/** 대표 일수 안에 드는가. */
export function isTypicalDays(region: string, days: CourseDays): boolean {
  return regionTypicalDays(region).includes(days);
}

/** 정렬 키 — 작을수록 대표. 표 밖 일수는 대표 1순위와의 거리 순으로 그 뒤. */
export function typicalDayRank(region: string, days: CourseDays): number {
  const list = regionTypicalDays(region);
  const i = list.indexOf(days);
  return i >= 0 ? i : list.length + Math.abs(days - list[0]) + days / 100;
}

/** 일수 목록을 대표 순으로 정렬. */
export function sortByTypicalDays<T extends { region: string; days: CourseDays }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => typicalDayRank(a.region, a.days) - typicalDayRank(b.region, b.days));
}

/**
 * 칩 분리 — 앞에 내세울 대표 일수(대표 순)와 "다른 일수"(일수 오름차순). 확인된 대표 일수가 하나도 없으면
 * 비어 보이지 않도록 가장 가까운 하나를 대표로 올린다.
 */
export function splitTypicalPages<T extends { region: string; days: CourseDays }>(pages: readonly T[]): { typical: T[]; others: T[] } {
  if (pages.length === 0) return { typical: [], others: [] };
  const sorted = sortByTypicalDays(pages);
  let typical = sorted.filter((p) => isTypicalDays(p.region, p.days));
  if (typical.length === 0) typical = [sorted[0]];
  const others = pages.filter((p) => !typical.includes(p)).sort((a, b) => a.days - b.days);
  return { typical, others };
}

/** 사이트맵 priority — 대표 일수 0.8, 휴양지형 1~2일 0.3, 그 외 0.7. */
export function courseSitemapPriority(region: string, days: CourseDays): number {
  if (isTypicalDays(region, days)) return 0.8;
  // 휴양지형 = 스타일이 resort이거나 대표 일수가 5일 이상(다낭처럼 코드상 도시형이지만 휴양 일정으로 가는 곳)
  const resortLike = styleForRegion(resolveRegionAlias(region)) === "resort" || regionTypicalDays(region)[0] >= 5;
  if (resortLike && days <= 2) return 0.3;
  return 0.7;
}
