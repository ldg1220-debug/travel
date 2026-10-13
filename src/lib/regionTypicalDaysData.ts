import rawData from "@/data/regionTypicalDays.json";

/**
 * 대표 일수 덮어쓰기 데이터(src/data/regionTypicalDays.json) — AutoPipeline 이 네이버 검색량으로 채운다. 값은 배열(`[4,5]`) 또는
 * `{ days: [4,5,7], altLabel: { "4": "3박5일" } }`(altLabel: 그 일수 페이지의 제목·H1·칩에 병기할 다른 표기, URL 은 그대로).
 * 가벼운 모듈로 따로 둔 이유 — coursePages.ts(클라이언트 번들에도 들어간다)가 discoverData 없이 altLabel 만 읽을 수 있게.
 */
export interface TypicalDaysEntry {
  days: number[];
  altLabel: Record<string, string>;
}

export const TYPICAL_DAYS_DATA: Readonly<Record<string, TypicalDaysEntry>> = Object.fromEntries(
  Object.entries(rawData as Record<string, number[] | { days: number[]; altLabel?: Record<string, string> }>).map(([region, v]) => [
    region,
    Array.isArray(v) ? { days: v, altLabel: {} } : { days: v.days, altLabel: v.altLabel ?? {} },
  ]),
);

/** 그 지역·일수에 병기할 다른 표기(없으면 undefined). */
export function altLabelFor(region: string, days: number): string | undefined {
  return TYPICAL_DAYS_DATA[region]?.altLabel[String(days)];
}
