import type { CourseDays } from "./server/courseBrief";
import { DOMESTIC_LOCALITY_NAMES, WORLD_CITIES, allSpots, flatRegions, resolveRegionAlias, styleForRegion } from "./discoverData";
import overrideData from "@/data/regionTypicalDays.json";

/**
 * 지역별 "실제로 많이 가는 일수" — 작업지시서 2026-10-13 v2 "거리(비행시간) 기준 + 검색량 덮어쓰기".
 * 앞쪽 일수일수록 대표. 값은 CourseDays(7 = 라벨 "5박7일"). 페이지는 없애지 않는다 — 대표 아닌 일수는 "다른 일수"로 뒤에.
 * 라벨 표기(3박5일 vs 4박5일)는 이 표와 무관하며 바꾸지 않는다.
 *
 * 우선순위: ① src/data/regionTypicalDays.json(검색량 기반 덮어쓰기, AutoPipeline이 채움) → ② 국내/제주 →
 * ③ 서울(37.57, 126.98)에서의 대권거리 구간. 이 파일 안의 일수는 그 지역 스타일이 허용하는 범위(도시 1~5 · 휴양 2~7)로 자른다.
 */
const SEOUL = { lat: 37.57, lng: 126.98 };
const DOMESTIC_DEFAULT: readonly CourseDays[] = [2, 1, 3];
const JEJU: readonly CourseDays[] = [3, 2, 4];

export type DistanceBand = "near" | "mid" | "far" | "veryFar";
/** 구간 경계(km) — 지시서 §2①. */
const NEAR_KM = 1500;
const MID_KM = 3000;
const FAR_KM = 5000;
/**
 * 지시서가 구간을 지역 이름으로 못박은 곳: 괌·사이판은 "1,500~3,000km"로 적혀 있으나 이 좌표로는 3,100~3,200km라 숫자만 보면
 * 먼 구간(5박7일)이 된다. 지시서의 명시 배정을 따른다.
 */
const BAND_PINS: Readonly<Record<string, DistanceBand>> = { 괌: "mid", 사이판: "mid" };

const BAND_DAYS: Record<DistanceBand, { resort: readonly number[]; city: readonly number[] }> = {
  near: { resort: [3, 4, 2], city: [3, 4, 2] },
  mid: { resort: [4, 5, 3], city: [4, 5, 3] },
  far: { resort: [7, 6, 5], city: [5, 4, 6] },
  veryFar: { resort: [7, 6], city: [7, 6] },
};

const rad = (d: number) => (d * Math.PI) / 180;
/** 대권거리(km, haversine). */
export function greatCircleKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

let coordMap: Map<string, { lat: number; lng: number }> | null = null;
/** 도시 좌표 — WORLD_CITIES 우선, 없으면 그 도시 스팟 좌표의 평균(CITY_SEEDS). */
function cityCoords(city: string): { lat: number; lng: number } | undefined {
  if (!coordMap) {
    coordMap = new Map();
    for (const [, name, lat, lng] of WORLD_CITIES) coordMap.set(name, { lat, lng });
    const sums = new Map<string, { lat: number; lng: number; n: number }>();
    for (const sp of allSpots("overseas")) {
      const name = sp.region.split(" · ")[1];
      if (!name || coordMap.has(name) || !Number.isFinite(sp.lat) || !Number.isFinite(sp.lng)) continue;
      const cur = sums.get(name) ?? { lat: 0, lng: 0, n: 0 };
      sums.set(name, { lat: cur.lat + sp.lat, lng: cur.lng + sp.lng, n: cur.n + 1 });
    }
    for (const [name, v] of sums) coordMap.set(name, { lat: v.lat / v.n, lng: v.lng / v.n });
  }
  return coordMap.get(city);
}

/** 서울에서 지역까지 km. 좌표를 모르면 undefined. */
export function distanceFromSeoulKm(region: string): number | undefined {
  const c = cityCoords(resolveRegionAlias(region));
  return c ? greatCircleKm(SEOUL.lat, SEOUL.lng, c.lat, c.lng) : undefined;
}

function bandOf(name: string): DistanceBand | undefined {
  const pin = BAND_PINS[name];
  if (pin) return pin;
  const km = distanceFromSeoulKm(name);
  if (km == null) return undefined;
  return km < NEAR_KM ? "near" : km < MID_KM ? "mid" : km < FAR_KM ? "far" : "veryFar";
}

let jejuNames: Set<string> | null = null;
function isJeju(region: string): boolean {
  if (!jejuNames) {
    jejuNames = new Set(["제주", "제주도"]);
    for (const r of flatRegions("domestic")) if (r.parent === "제주" || r.parent === "제주도") jejuNames.add(r.name);
  }
  return jejuNames.has(region);
}

function maxDaysOf(name: string): number {
  return styleForRegion(name) === "resort" ? 7 : 5;
}
/** 스타일이 허용하는 일수만 남긴다. 하나도 안 남으면(도시형 [7,6]) 허용 상한부터 두 개. */
function clampDays(days: readonly number[], max: number): readonly CourseDays[] {
  const ok = days.filter((d) => d >= 1 && d <= max);
  return (ok.length > 0 ? ok : [max, max - 1]) as CourseDays[];
}

/** 앞쪽일수록 대표. JSON 덮어쓰기 → 국내(제주 [3,2,4]) → 서울 거리 구간. 좌표도 모르면 스타일 기본([7,6,5] 휴양 · [3,2,4] 도시). */
export function regionTypicalDays(region: string): readonly CourseDays[] {
  const name = resolveRegionAlias(region);
  const override = (overrideData as Record<string, number[]>)[name];
  if (override?.length) return clampDays(override, maxDaysOf(name));
  if (isJeju(name)) return JEJU;
  const band = bandOf(name);
  if (band) return clampDays(BAND_DAYS[band][styleForRegion(name)], maxDaysOf(name));
  if (DOMESTIC_LOCALITY_NAMES.has(name)) return DOMESTIC_DEFAULT;
  return clampDays(styleForRegion(name) === "resort" ? [7, 6, 5] : [3, 2, 4], maxDaysOf(name));
}

/** 서울에서 3,000km 이상(= 먼 구간 이상)인가 — 사이트맵에서 1~2일 페이지를 낮추는 기준. */
export function isLongHaul(region: string): boolean {
  const band = bandOf(resolveRegionAlias(region));
  return band === "far" || band === "veryFar";
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

/** 사이트맵 priority — 대표 일수 0.8, 서울에서 3,000km 이상 지역의 1~2일 0.3, 대표 1순위가 7일인 지역(코타키나발루·세부 등)은 3일 이하 0.3, 그 외 0.5. */
export function courseSitemapPriority(region: string, days: CourseDays): number {
  if (isTypicalDays(region, days)) return 0.8;
  if (days <= 2 && isLongHaul(region)) return 0.3;
  if (days <= 3 && regionTypicalDays(region)[0] === 7) return 0.3; // 작업지시서 2026-10-13 "#309 검증" §3
  return 0.5;
}
