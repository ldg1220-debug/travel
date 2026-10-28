import indexedCoursesJson from "@/data/indexedCourses.json";

/**
 * 검색 노출(색인) 대상 코스 — 작업지시서 2026-10-28 "코스 페이지는 사람이 열 때만". 사이트맵·허브 카드·워밍은 이 목록만 쓰고,
 * 나머지 코스 페이지는 noindex 이며 사람이 열 때 만든다. 목록은 `src/data/indexedCourses.json` 에서 고친다(`days` = 일수, 2박3일 = 3).
 */
export interface IndexedCourse {
  region: string;
  days: number;
}

export const INDEXED_COURSES: readonly IndexedCourse[] = indexedCoursesJson as IndexedCourse[];

const KEYS = new Set(INDEXED_COURSES.map((c) => `${c.region}/${c.days}`));

export function isIndexedCourse(region: string, days: number): boolean {
  return KEYS.has(`${region}/${days}`);
}
