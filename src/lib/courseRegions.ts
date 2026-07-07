import { regionHierarchy, type DiscoverScope, type RegionNode } from "@/lib/discoverData";
import { CONTINENT_EMOJI, COUNTRY_EMOJI, DOMESTIC_CANONICAL } from "@/lib/regions";

/**
 * 코스 만들기의 지역 선택 — 탐색(지역별)과 **같은 통합 지역 트리**를 쓴다.
 *  - 국내: 광역(8도+특별·광역시) → 시/군 (2단계에서 검색 시작)
 *  - 해외: 대륙 → 국가 → 도시 (3단계에서 검색 시작)
 * leaf 라벨은 라이브 Places/Kakao 검색의 시드 텍스트("강릉 맛집")로만
 * 쓰이므로, 데이터가 없는 지역을 골라도 실제 검색은 그대로 동작한다.
 */
export interface CourseRegionNode {
  label: string;
  emoji?: string;
  children: CourseRegionNode[];
}

function withEmoji(node: RegionNode, emoji?: string): CourseRegionNode {
  return { label: node.label, emoji, children: node.children.map((c) => withEmoji(c, COUNTRY_EMOJI[c.label])) };
}

export function courseRegionTree(scope: DiscoverScope): CourseRegionNode[] {
  if (scope === "domestic") {
    return DOMESTIC_CANONICAL.map((p) => ({
      label: p.label,
      emoji: p.emoji,
      children: p.children.map((c) => ({ label: c, children: [] })),
    }));
  }
  return regionHierarchy("overseas").map((cont) => withEmoji(cont, CONTINENT_EMOJI[cont.label]));
}

/** 검색을 시작할 수 있는 깊이 — 국내는 시/군(2), 해외는 도시(3). */
export function searchableDepth(scope: DiscoverScope): number {
  return scope === "domestic" ? 2 : 3;
}

/** Walks `tree` down `path`, returning the children at that point ([] past a leaf). */
export function courseNodesAtPath(tree: CourseRegionNode[], path: string[]): CourseRegionNode[] {
  let nodes = tree;
  for (const label of path) {
    const next = nodes.find((n) => n.label === label);
    if (!next) return [];
    nodes = next.children;
  }
  return nodes;
}

/** One "slot" of the course — a category the user fills with places. `tag` maps to the live-search category filter (undefined = pure text query, e.g. 카페). */
export interface CourseSlot {
  key: string;
  label: string;
  emoji: string;
  tag?: "관광지" | "음식점" | "숙소";
  /** Korean keyword appended to the city for the live query (e.g. "강릉 맛집"). */
  keyword: string;
  /** Rough hour to schedule this slot at when assembling the itinerary. */
  hour: number;
}

export const COURSE_SLOTS: CourseSlot[] = [
  { key: "attraction", label: "관광지", emoji: "🏛️", tag: "관광지", keyword: "관광지", hour: 10 },
  { key: "lunch", label: "점심 맛집", emoji: "🍜", tag: "음식점", keyword: "맛집", hour: 12 },
  { key: "cafe", label: "카페", emoji: "☕", keyword: "카페", hour: 15 },
  { key: "dinner", label: "저녁 맛집", emoji: "🍖", tag: "음식점", keyword: "맛집", hour: 18 },
  { key: "lodging", label: "숙소", emoji: "🏨", tag: "숙소", keyword: "숙소", hour: 21 },
];
