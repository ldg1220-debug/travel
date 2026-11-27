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
  const sepped = stripCjkTail(stripNameSeparator(name));
  const idx = sepped.search(/\s[-–—]\s/);
  if (idx < 0) return sepped;
  const head = sepped.slice(0, idx).trim();
  return head.length >= 2 ? head : sepped;
}

const CJK = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}`;
const CJK_PAREN_TAIL = new RegExp(String.raw`\s*[(（]([^()（）]*[${CJK}][^()（）]*)[)）]\s*$`, "u");
const CJK_SPACE_TAIL = new RegExp(String.raw`\s+[${CJK}].*$`, "u");

/**
 * 한글 이름 뒤 한자·가나 꼬리 정리 — 작업지시서 2026-11-28. 이름에 한글이 있을 때만:
 * 한글 없는 괄호 꼬리 "탕롱황성(昇龍皇城)"·"한국요리 돈키호테 (韓国料理 豚キホーテ)", 공백 뒤 한자·가나로 시작하는 꼬리(영문 포함)를 뗀다.
 * 괄호 안에 한글이 있거나("문묘(반미에우)") 한자·가나가 없으면("독도(dokdo)") 그대로. 결과가 2글자 미만이면 원래 이름.
 */
export function stripCjkTail(name: string): string {
  if (!hasHangul(name)) return name;
  let out = name;
  const m = CJK_PAREN_TAIL.exec(out);
  if (m && !hasHangul(m[1])) out = out.slice(0, m.index);
  out = out.replace(CJK_SPACE_TAIL, "").trim();
  return hasHangul(out) && out.length >= 2 ? out : name;
}

/** 검색어로 붙는 업종·지역 일반어(소문자). 이 단어들만으로 된 조각은 상호가 아니다. */
const GENERIC_TERMS = new Set([
  "맛집", "추천", "한식당", "한식", "식당", "레스토랑", "카페", "맛집추천", "현지인", "베스트", "인기", "유명",
  "korean", "bbq", "restaurant", "restaurants", "best", "food", "cafe", "top", "hotel",
  "다낭", "하노이", "호치민", "나트랑", "푸꾸옥", "방콕", "치앙마이", "파타야", "도쿄", "오사카", "교토", "후쿠오카", "삿포로", "오키나와", "제주", "제주도", "서울", "부산", "세부", "보라카이", "마닐라", "싱가포르", "홍콩", "마카오", "타이베이", "대만", "괌", "사이판", "발리", "쿠알라룸푸르", "코타키나발루",
]);

function isGenericToken(t: string): boolean {
  return GENERIC_TERMS.has(t.toLowerCase());
}

/**
 * "ㅣ"·"|"·"｜" 로 검색어를 이어 붙인 이름 정리 — 조각으로 나눠 지역·업종 일반어만인 조각을 버리고 첫 조각을 쓴다(다 버려지면 첫 조각).
 * 고른 조각 끝의 일반어("국제시장 다낭 맛집" → "국제시장")도 뗀다. 결과가 2글자 미만이면 원래 이름. 구분자가 없으면 그대로.
 */
export function stripNameSeparator(name: string): string {
  if (!/[ㅣ|｜]/.test(name)) return name;
  const pieces = name.split(/[ㅣ|｜]/).map((p) => p.trim()).filter(Boolean);
  if (pieces.length === 0) return name;
  const kept = pieces.filter((p) => !p.split(/\s+/).every(isGenericToken));
  const chosen = kept[0] ?? pieces[0];
  const tokens = chosen.split(/\s+/);
  while (tokens.length > 1 && isGenericToken(tokens[tokens.length - 1])) tokens.pop();
  const result = tokens.join(" ").trim();
  return result.length >= 2 ? result : name;
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
