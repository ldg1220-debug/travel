import type { CordixIconName } from "@/components/icons/CordixIcon";

/**
 * 단일 출처 — 하단 탭바(모바일)와 AppBar의 데스크톱 인라인 메뉴가 둘 다
 * 이 배열을 그대로 쓴다. 탭바 도입 작업지시서(2026-08-15, B안)의 5탭
 * 구성: 홈·탐색·계획·커뮤니티·MY. `/discover`·`/feed`·`/community`·
 * `/scrapbook`·`/saved-places` 등 기존 라우트는 하나도 안 건드리고,
 * 이 nav 레이어만 새로 얹는다.
 *
 * `isActive`는 세그먼트로 묶인 라우트(예: /feed·/community → "커뮤니티",
 * /scrapbook·/saved-places → "MY")까지 포함해서 어느 탭이 하이라이트될지
 * 결정한다 — 실제 URL이 탭의 `href`와 달라도(예: /trip/[id] 글 상세는
 * "커뮤니티" 탭 아래) 매칭되면 그 탭이 활성 표시된다.
 */
export interface NavTab {
  key: string;
  label: string;
  href: string;
  /** CordixIcon의 duotone nav 세트에서 골랐다 — "홈"만 예외로 undefined(대응하는 아이콘이 없어, 쓰는 쪽에서 lucide `Home`으로 대체). */
  icon: CordixIconName | undefined;
  isActive: (pathname: string) => boolean;
}

const startsWithAny = (pathname: string, prefixes: string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export const NAV_TABS: NavTab[] = [
  {
    key: "home",
    label: "홈",
    href: "/",
    icon: undefined,
    isActive: (p) => p === "/",
  },
  {
    key: "discover",
    label: "탐색",
    href: "/discover",
    icon: "trip-map",
    // /course는 "여행 계획짜기"(discover)의 하위 플로우였던 관성 그대로 탐색 탭 소속.
    isActive: (p) => startsWithAny(p, ["/discover", "/course"]),
  },
  {
    key: "planner",
    label: "계획",
    href: "/planner",
    icon: "plan-check",
    // /tme(트래블 메이트 초대 랜딩)는 여행 관련 흐름이라 계획 탭에 붙인다 — 그 외엔 마땅한 자리가 없다.
    isActive: (p) => startsWithAny(p, ["/planner", "/tme"]),
  },
  {
    key: "community",
    label: "커뮤니티",
    href: "/feed",
    icon: "group",
    // /trip/[id](후기 상세)도 피드에서 파생된 콘텐츠라 커뮤니티 탭 소속.
    isActive: (p) => startsWithAny(p, ["/feed", "/community", "/trip"]),
  },
  {
    key: "my",
    label: "MY",
    href: "/my",
    icon: "user",
    // 보관함 2종(여행/장소)과 메시지는 MY 페이지에서 진입하는 하위 화면이라
    // 그리로 갔을 때도 MY가 활성 상태를 유지해야 "지금 어디 있는지" 감이
    // 안 끊긴다. /admin·/terms·/privacy도 MY의 링크에서만 들어오므로 같이 묶는다.
    isActive: (p) => startsWithAny(p, ["/my", "/scrapbook", "/saved-places", "/messages", "/admin", "/terms", "/privacy"]),
  },
];
