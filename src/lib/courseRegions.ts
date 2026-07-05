import type { DiscoverScope } from "@/lib/discoverData";

/**
 * Region picklists for the 추천 코스 마법사 (course builder). These are
 * just the text labels used to seed a live Places/Kakao search (e.g.
 * "강릉 맛집") — not a geographic dataset, so a short curated list of the
 * major/popular areas per 시·도 (domestic) or per country (overseas) is
 * enough and keeps the picker tidy. Any place actually returned comes
 * from the live API, not from here.
 */
export interface RegionGroup {
  /** 시·도 (domestic) or 국가 (overseas). */
  label: string;
  emoji?: string;
  /** Cities / areas searchable within it. */
  cities: string[];
}

export const DOMESTIC_REGIONS: RegionGroup[] = [
  { label: "서울", emoji: "🏙️", cities: ["강남", "홍대·마포", "종로·광화문", "성수", "명동·을지로", "잠실·송파", "이태원·용산"] },
  { label: "경기", emoji: "🌆", cities: ["수원", "가평", "파주", "용인", "포천", "양평", "인천"] },
  { label: "강원", emoji: "⛰️", cities: ["강릉", "속초", "춘천", "평창", "정선", "양양", "동해"] },
  { label: "충청", emoji: "🌾", cities: ["대전", "청주", "공주", "보령", "단양", "태안", "천안"] },
  { label: "전라", emoji: "🍚", cities: ["전주", "여수", "순천", "목포", "담양", "군산", "남원"] },
  { label: "경상", emoji: "🌊", cities: ["부산", "대구", "경주", "통영", "안동", "포항", "거제", "진주"] },
  { label: "제주", emoji: "🌴", cities: ["제주시", "서귀포", "애월", "성산", "중문", "한림"] },
];

export const OVERSEAS_REGIONS: RegionGroup[] = [
  { label: "일본", emoji: "🇯🇵", cities: ["오사카", "도쿄", "후쿠오카", "교토", "삿포로", "오키나와", "나고야"] },
  { label: "베트남", emoji: "🇻🇳", cities: ["다낭", "호치민", "하노이", "나트랑", "호이안", "푸꾸옥"] },
  { label: "태국", emoji: "🇹🇭", cities: ["방콕", "치앙마이", "푸켓", "파타야"] },
  { label: "대만", emoji: "🇹🇼", cities: ["타이베이", "가오슝", "타이중", "화롄"] },
  { label: "이탈리아", emoji: "🇮🇹", cities: ["로마", "베네치아", "피렌체", "밀라노", "나폴리"] },
  { label: "스페인", emoji: "🇪🇸", cities: ["바르셀로나", "마드리드", "세비야", "그라나다"] },
  { label: "미국", emoji: "🇺🇸", cities: ["샌프란시스코", "뉴욕", "로스앤젤레스", "라스베이거스", "하와이"] },
];

export function regionsForScope(scope: DiscoverScope): RegionGroup[] {
  return scope === "domestic" ? DOMESTIC_REGIONS : OVERSEAS_REGIONS;
}

/** One "slot" of the course — a category the user fills with exactly one place. `tag` maps to the live-search category filter (undefined = pure text query, e.g. 카페). */
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
