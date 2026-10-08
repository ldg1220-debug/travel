import { isSupportedRegion, maxDaysForStyle, meetsResortBeachRequirement, minViableSpots, type CourseBrief, type CourseDays } from "./courseBrief";
import { resolveRegionAlias, styleForRegion } from "@/lib/discoverData";
import { courseCanonicalPath, isCourseBriefThin, labelToDays } from "@/lib/coursePages";

/**
 * `/course/{지역}/{일수}` 페이지의 입구 판정 — 작업지시서 2026-10-08 "코스 페이지가 전부 404입니다"
 * §1. 예전엔 24곳짜리 허용목록(ENABLED_COURSE_PAGES)에 없는 (지역, 일수)는 getCourseBrief를 부르기도
 * 전에 404였다 — 오사카·도쿄·서울 3일 같은 조합이 course-brief API에선 200인데 페이지만 404였던 이유다.
 * 이제 입구는 "지원하는 지역 × 그 스타일이 허용하는 일수(도시형 1~5 · 휴양형 2~7)"이고, 색인 여부는
 * 사이트맵(크론이 200 확인한 조합만)이 정한다. 일수 세그먼트는 "2박3일" 라벨이 정본이지만 "3"처럼
 * 숫자로 와도 정본 주소로 영구 리다이렉트한다.
 */

export type CoursePageRoute =
  | { kind: "ok"; region: string; days: CourseDays }
  | { kind: "redirect"; to: string }
  | { kind: "reject"; reason: string };

/** 휴양형은 1일(당일치기) 코스를 만들지 않는다 — course-brief 최소 일수. */
export function minDaysForStyle(style: "city" | "resort"): CourseDays {
  return style === "resort" ? 2 : 1;
}

export function resolveCoursePageRoute(region: string, daysSegment: string): CoursePageRoute {
  const canonicalRegion = resolveRegionAlias(region);
  if (!isSupportedRegion(canonicalRegion)) return { kind: "reject", reason: `unsupported-region(${region})` };

  const labelDays = labelToDays(daysSegment);
  const numeric = /^[1-7]$/.test(daysSegment) ? (Number(daysSegment) as CourseDays) : null;
  const days = labelDays ?? numeric;
  if (days == null) return { kind: "reject", reason: `unknown-days-segment(${daysSegment})` };

  const style = styleForRegion(canonicalRegion);
  const min = minDaysForStyle(style);
  const max = maxDaysForStyle(style);
  if (days < min || days > max) return { kind: "reject", reason: `days-out-of-range(days=${days} allowed=${min}~${max} style=${style})` };

  // 별칭("발리")·숫자 일수("3")는 정본 주소로 모은다 — 중복 URL이 색인에 갈라지지 않게.
  if (canonicalRegion !== region || labelDays == null) return { kind: "redirect", to: courseCanonicalPath(canonicalRegion, days) };
  return { kind: "ok", region: canonicalRegion, days };
}

/** 브리프가 페이지로 낼 만한가 — course-brief API(422)·사이트맵과 같은 기준. 통과면 null, 아니면 사유. */
export function judgeCourseBrief(brief: Pick<CourseBrief, "spots">, region: string, days: CourseDays): string | null {
  const style = styleForRegion(region);
  const min = minViableSpots(style, days);
  if (isCourseBriefThin(brief.spots as CourseBrief["spots"], min)) return `thin(spots=${brief.spots.length} min=${min} unrated=${brief.spots.filter((s) => s.rating == null).length})`;
  if (!meetsResortBeachRequirement(brief.spots, style)) return "no-beach";
  return null;
}
