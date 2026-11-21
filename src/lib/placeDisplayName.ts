/**
 * 장소 표시 이름 순수 로직 — 작업지시서 2026-11-22 "첫 화면 장소 이름".
 * 서버/클라이언트 어디서든 쓸 수 있게 DB·네트워크를 import 하지 않는다. 한글 표기 생성·저장은 lib/server/placeDisplayNames.ts.
 */

/** 한글(완성형·자모)이 한 글자라도 있는가. */
export function hasHangul(name: string): boolean {
  return /[ᄀ-ᇿ㄰-㆏가-힣]/.test(name);
}

/**
 * 상호명 꼬리 정리 — 이름의 " - " 뒤 설명("- Island Hopping in Mactan Cebu"·"- Vietnamese Restaurant & Vegan Food"·"- Shibuya")을 자른다.
 * 앞부분이 2글자 미만이면 원래 이름을 둔다. 붙은 하이픈("Coca-Cola")·공백 없는 대시는 건드리지 않는다.
 */
export function stripNameTail(name: string): string {
  const idx = name.search(/\s[-–—]\s/);
  if (idx < 0) return name;
  const head = name.slice(0, idx).trim();
  return head.length >= 2 ? head : name;
}

/** "{한글} ({원문})" — 한글 표기가 원문과 같거나 비었으면 한글(또는 원문)만. */
export function formatKoreanDisplay(ko: string | undefined | null, original: string): string {
  const k = (ko ?? "").trim();
  if (!k || k === original) return original;
  return `${k} (${original})`;
}

/** 한글 표기를 만들어야 하는 이름인가 — 한글이 없고, 글자(문자)가 있다. */
export function needsKoreanName(name: string): boolean {
  return !hasHangul(name) && /\p{L}/u.test(name);
}
