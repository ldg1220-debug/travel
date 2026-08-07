/**
 * 커뮤니티 게시판 카테고리 — 운영진이 필요할 때 여기만 고쳐서 추가/삭제한다
 * (사용자가 직접 만드는 값이 아니라 DB 테이블로 빼지 않았다).
 *
 * 원래 6개(자유수다/질문답변/동행 구해요/여행 꿀팁/국내 정보공유/해외
 * 정보공유)였는데, 초기 단계엔 유저가 적어 카테고리가 잘게 나뉠수록 대부분
 * "아직 글이 없어요" 빈 방으로 보여 오히려 이탈을 만든다는 리뷰를 받아
 * 3개로 통합. 글이 쌓이면 다시 분화하면 된다.
 */
export const COMMUNITY_CATEGORIES = [
  { slug: "free", label: "자유수다·질문" },
  { slug: "companion", label: "동행 구해요" },
  { slug: "tips", label: "정보·꿀팁" },
] as const;

export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number]["slug"];

/**
 * 통합 이전에 쓰이던 슬러그 — 이미 그 값으로 저장된 기존 글이 있을 수 있어
 * DB 마이그레이션 없이도 화면에는 통합된 카테고리로 자연스럽게 보이게
 * 매핑해둔다. 새 글은 isCommunityCategory가 위 3개만 허용하므로 여기 값으로
 * 저장될 일이 없다 — 오직 과거 데이터 호환용.
 */
const LEGACY_CATEGORY_ALIASES: Record<string, CommunityCategory> = {
  qna: "free",
  "info-domestic": "tips",
  "info-international": "tips",
};

/** slug(현재 값이든 통합 전 레거시 값이든)이 실제로 속하는 카테고리. */
function canonicalCategory(slug: string): CommunityCategory | undefined {
  if (isCommunityCategory(slug)) return slug;
  return LEGACY_CATEGORY_ALIASES[slug];
}

export function communityCategoryLabel(slug: string): string {
  const canonical = canonicalCategory(slug);
  return canonical ? COMMUNITY_CATEGORIES.find((c) => c.slug === canonical)!.label : slug;
}

/**
 * 레거시 슬러그로 저장된 기존 글을 수정할 때 쓰는 정규화 — 통합 전 값이
 * 카테고리 선택 칩 중 어디에도 안 걸려 아무 칩도 선택 안 된 것처럼 보이고,
 * 그대로 다시 저장하면 서버(isCommunityCategory)가 더 이상 유효하지 않은
 * 값이라 거부하는 문제를 막는다. 못 알아보는 값은 첫 번째 카테고리로.
 */
export function normalizeCommunityCategory(slug: string): CommunityCategory {
  return canonicalCategory(slug) ?? COMMUNITY_CATEGORIES[0].slug;
}

/** 게시글 저장용 — 통합 이후엔 위 3개 슬러그만 유효하다(레거시 값은 새로 저장되지 않음). */
export function isCommunityCategory(value: string): value is CommunityCategory {
  return COMMUNITY_CATEGORIES.some((c) => c.slug === value);
}

/**
 * 목록 필터용 — canonical 카테고리 하나를 고르면, 그 카테고리로 저장된
 * 새 글뿐 아니라 통합 이전 레거시 슬러그로 저장된 옛날 글까지 같이 걸린다.
 * (그렇지 않으면 "자유수다·질문"으로 필터링했을 때 예전 "qna" 카테고리
 * 글들이 안 보이는 회귀가 생긴다.)
 */
export function categorySlugsFor(canonical: CommunityCategory): string[] {
  const legacy = Object.entries(LEGACY_CATEGORY_ALIASES)
    .filter(([, mapped]) => mapped === canonical)
    .map(([slug]) => slug);
  return [canonical, ...legacy];
}

/** 전체공개 / 트레쥴러만(로그인 회원 누구나) / 특정인공개(선택한 팔로워만) / 나만보기. 여행 후기의 Visibility(친구공개=맞팔로우)와는 "members" 단계의 의미가 달라 별도 타입을 쓴다. */
export type CommunityVisibility = "public" | "members" | "custom" | "private";
