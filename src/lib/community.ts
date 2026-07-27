/** 커뮤니티 게시판 카테고리 — 운영진이 필요할 때 여기만 고쳐서 추가/삭제한다(사용자가 직접 만드는 값이 아니라 DB 테이블로 빼지 않았다). */
export const COMMUNITY_CATEGORIES = [
  { slug: "free", label: "자유수다" },
  { slug: "qna", label: "질문답변" },
  { slug: "companion", label: "동행 구해요" },
  { slug: "tips", label: "여행 꿀팁" },
  { slug: "info-domestic", label: "국내 정보공유" },
  { slug: "info-international", label: "해외 정보공유" },
] as const;

export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number]["slug"];

export function communityCategoryLabel(slug: string): string {
  return COMMUNITY_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

export function isCommunityCategory(value: string): value is CommunityCategory {
  return COMMUNITY_CATEGORIES.some((c) => c.slug === value);
}

/** 전체공개 / 트레쥴러만(로그인 회원 누구나) / 특정인공개(선택한 팔로워만) / 나만보기. 여행 후기의 Visibility(친구공개=맞팔로우)와는 "members" 단계의 의미가 달라 별도 타입을 쓴다. */
export type CommunityVisibility = "public" | "members" | "custom" | "private";
