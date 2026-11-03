/**
 * /api/places/search 같은 질의 짧은 캐시 — 작업지시서 2026-11-03 "text-pro user 일일 상한 소진" §1②.
 * 검색 한 번이 Google Text Search 를 최대 6번(언어 2회 × 카테고리 팬아웃) 부르므로, 같은 질의의 반복(자동완성 재입력 · 새로고침 · 탭 이동 · 봇)이 상한을 먹지 않게 한다.
 * 약관: place_id 만 장기 보관 가능하고 그 외 Google 콘텐츠(이름·주소·평점 등)는 짧게만 둔다 → 서버 프로세스 메모리에 10분(DB·파일 저장 없음).
 */
export const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 300;
/** 이보다 짧은 질의는 Google 을 부르지 않는다(한 글자 입력 중 호출 방지). 좌표(내 주변)·pageToken 요청에는 적용하지 않는다. */
export const MIN_SEARCH_QUERY_CHARS = 2;

const store = new Map<string, { at: number; value: unknown }>();

export function searchCacheKey(parts: { region: string; category: string; query: string; hasToken: boolean }): string {
  return [parts.region, parts.category, parts.query.normalize("NFC").toLowerCase().replace(/\s+/g, " "), parts.hasToken ? "t" : ""].join("|");
}

export function getCachedSearch<T>(key: string, now = Date.now()): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (now - hit.at > SEARCH_CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setCachedSearch(key: string, value: unknown, now = Date.now()): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { at: now, value });
}

export function clearSearchCache(): void {
  store.clear();
}

/** 질의가 너무 짧은가 — 공백 제외 글자 수 기준. */
export function isQueryTooShort(query: string): boolean {
  return [...query.replace(/\s+/g, "")].length < MIN_SEARCH_QUERY_CHARS;
}
