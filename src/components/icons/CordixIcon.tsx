/**
 * 자체 제작 듀오톤 아이콘 세트 — 32×32 캔버스, 2px stroke, sharp corners.
 * 디자인팀이 전달한 icons.js(Cordix Icon Set v1.0)를 React 컴포넌트로 옮겼다.
 * 원본은 순수 JS로 DOM에 직접 SVG 문자열을 꽂아 넣는 방식(`CordixIcons.hydrate()`)
 * 이었는데, 이 앱은 React라 선언적으로 쓸 수 있게 컴포넌트 하나로 감쌌다.
 *
 * A(액션)·C(카테고리)·D(예비/로드맵) 그룹만 옮겼다 — B(홈 8칸 그리드)는
 * 땡처리항공/할인매장/쇼핑쿠폰/esim 등 제휴 커머스 전용이라 지금 화면
 * 어디에도 대응하는 자리가 없다(#150 제휴 기능 보류와 같은 이유).
 */

const ICONS: Record<string, string> = {
  // ── Group A: 액션 ──
  search: `
    <circle cx="14" cy="14" r="8" fill="none" stroke="{stroke}" stroke-width="2"/>
    <circle cx="14" cy="14" r="4" fill="{accent}" opacity="1"/>
    <line x1="20" y1="20" x2="27" y2="27" stroke="{stroke}" stroke-width="2.5" stroke-linecap="square"/>
  `,
  star: `
    <path d="M16 4 L19.6 12.2 L28.5 13 L21.8 18.9 L23.8 27.6 L16 22.8 L8.2 27.6 L10.2 18.9 L3.5 13 L12.4 12.2 Z"
      fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
  `,
  "star-outline": `
    <path d="M16 4 L19.6 12.2 L28.5 13 L21.8 18.9 L23.8 27.6 L16 22.8 L8.2 27.6 L10.2 18.9 L3.5 13 L12.4 12.2 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
  `,
  camera: `
    <path d="M4 10 L10 10 L12 6 L20 6 L22 10 L28 10 L28 26 L4 26 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <circle cx="16" cy="17" r="5" fill="{accent}" stroke="{stroke}" stroke-width="2"/>
    <circle cx="16" cy="17" r="2" fill="{stroke}"/>
    <rect x="6" y="12" width="3" height="1.5" fill="{stroke}"/>
  `,
  pencil: `
    <path d="M4 28 L4 22 L20 6 L26 12 L10 28 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M18 8 L24 14" stroke="{stroke}" stroke-width="2"/>
    <path d="M20 6 L26 12 L23 15 L17 9 Z" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M4 22 L4 28 L10 28 L7 25 Z" fill="{stroke}"/>
  `,
  trash: `
    <path d="M6 8 L26 8" stroke="{stroke}" stroke-width="2.5" stroke-linecap="square"/>
    <path d="M12 8 L12 5 L20 5 L20 8" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M8 8 L8 27 L24 27 L24 8 Z" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M8 8 L24 8 L24 12 L8 12 Z" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <line x1="13" y1="15" x2="13" y2="24" stroke="{stroke}" stroke-width="2"/>
    <line x1="19" y1="15" x2="19" y2="24" stroke="{stroke}" stroke-width="2"/>
  `,
  share: `
    <path d="M8 20 C 8 12, 16 8, 24 8" fill="none" stroke="{stroke}" stroke-width="2" stroke-linecap="square"/>
    <path d="M18 4 L24 8 L20 14" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter" stroke-linecap="square"/>
    <path d="M4 16 L4 28 L28 28 L28 16" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <circle cx="24" cy="8" r="2.5" fill="{accent}" stroke="{stroke}" stroke-width="2"/>
  `,
  pin: `
    <path d="M16 4 C 10 4, 6 8, 6 14 C 6 20, 16 29, 16 29 C 16 29, 26 20, 26 14 C 26 8, 22 4, 16 4 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <circle cx="16" cy="14" r="4" fill="{accent}" stroke="{stroke}" stroke-width="2"/>
  `,
  folder: `
    <path d="M4 8 L12 8 L15 11 L28 11 L28 26 L4 26 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M4 11 L28 11 L28 15 L4 15 Z" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
  `,
  plane: `
    <path d="M16 3 L18 14 L29 18 L29 21 L18 19 L18 25 L21 27 L21 29 L16 27.5 L11 29 L11 27 L14 25 L14 19 L3 21 L3 18 L14 14 Z"
      fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
  `,
  lock: `
    <path d="M9 14 L9 10 C 9 6, 12 3, 16 3 C 20 3, 23 6, 23 10 L 23 14"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <rect x="5" y="14" width="22" height="15" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <rect x="5" y="14" width="22" height="15" fill="{accent}" opacity="0.15"/>
    <circle cx="16" cy="21" r="2.5" fill="{accent}" stroke="{stroke}" stroke-width="2"/>
    <line x1="16" y1="21" x2="16" y2="26" stroke="{stroke}" stroke-width="2"/>
  `,
  globe: `
    <circle cx="16" cy="16" r="12" fill="none" stroke="{stroke}" stroke-width="2"/>
    <ellipse cx="16" cy="16" rx="5" ry="12" fill="none" stroke="{stroke}" stroke-width="2"/>
    <line x1="4" y1="16" x2="28" y2="16" stroke="{stroke}" stroke-width="2"/>
    <path d="M6 10 L26 10 M6 22 L26 22" stroke="{stroke}" stroke-width="2"/>
    <circle cx="16" cy="16" r="12" fill="{accent}" opacity="0.12"/>
  `,

  // ── Group C: 카테고리 ──
  landmark: `
    <path d="M16 3 L28 10 L28 12 L4 12 L4 10 Z" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <line x1="4" y1="28" x2="28" y2="28" stroke="{stroke}" stroke-width="2.5" stroke-linecap="square"/>
    <rect x="7" y="12" width="3" height="14" fill="none" stroke="{stroke}" stroke-width="2"/>
    <rect x="14.5" y="12" width="3" height="14" fill="none" stroke="{stroke}" stroke-width="2"/>
    <rect x="22" y="12" width="3" height="14" fill="none" stroke="{stroke}" stroke-width="2"/>
    <rect x="3" y="26" width="26" height="2" fill="{stroke}"/>
  `,
  restaurant: `
    <line x1="9" y1="3" x2="9" y2="29" stroke="{stroke}" stroke-width="2" stroke-linecap="square"/>
    <path d="M5 3 L5 11 C 5 12.5, 6 13.5, 9 13.5 C 12 13.5, 13 12.5, 13 11 L 13 3"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M22 3 C 19 3, 17 6, 17 11 C 17 14, 19 15, 20 15 L 20 29"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <ellipse cx="20" cy="9" rx="3" ry="5" fill="{accent}" opacity="0.9"/>
  `,
  cafe: `
    <path d="M5 10 L5 22 C 5 25, 7 27, 10 27 L 20 27 C 23 27, 25 25, 25 22 L 25 10 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M25 13 L28 13 C 30 13, 30 20, 28 20 L 25 20" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M5 10 L25 10 L25 14 L5 14 Z" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M11 3 C 11 5, 9 5, 9 7 M 15 3 C 15 5, 13 5, 13 7 M 19 3 C 19 5, 17 5, 17 7"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linecap="square"/>
  `,
  bed: `
    <path d="M3 22 L3 12 L 14 12 L 14 18 L 29 18 L 29 22" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <line x1="3" y1="22" x2="3" y2="27" stroke="{stroke}" stroke-width="2"/>
    <line x1="29" y1="22" x2="29" y2="27" stroke="{stroke}" stroke-width="2"/>
    <line x1="3" y1="22" x2="29" y2="22" stroke="{stroke}" stroke-width="2.5" stroke-linecap="square"/>
    <path d="M6 18 L 12 18 L 12 14 L 6 14 Z" fill="{accent}"/>
    <circle cx="8" cy="16" r="1.5" fill="{stroke}"/>
  `,
  shopping: `
    <path d="M6 10 L26 10 L24 28 L8 28 Z" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M6 10 L26 10 L25.3 16 L6.7 16 Z" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M11 12 L 11 8 C 11 5, 13 3, 16 3 C 19 3, 21 5, 21 8 L 21 12"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
  `,
  bar: `
    <path d="M4 4 L28 4 L 20 15 L 20 26 L 24 28 L 24 29 L 8 29 L 8 28 L 12 26 L 12 15 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M7 7 L25 7 L 19 14 L 13 14 Z" fill="{accent}"/>
  `,
  beach: `
    <path d="M3 20 Q 8 16, 13 20 T 23 20 T 29 20" fill="none" stroke="{stroke}" stroke-width="2" stroke-linecap="square"/>
    <path d="M3 25 Q 8 21, 13 25 T 23 25 T 29 25" fill="none" stroke="{accent}" stroke-width="2.5" stroke-linecap="square"/>
    <circle cx="24" cy="8" r="4" fill="{accent}" stroke="{stroke}" stroke-width="2"/>
    <path d="M3 10 L 12 4 L 12 15" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
  `,
  camping: `
    <path d="M16 3 L 3 27 L 29 27 Z" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M16 3 L 12 27 M 16 3 L 20 27" stroke="{stroke}" stroke-width="2"/>
    <path d="M12 27 L 16 20 L 20 27 Z" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <line x1="3" y1="27" x2="29" y2="27" stroke="{stroke}" stroke-width="2.5" stroke-linecap="square"/>
  `,

  // ── Group D: 예비 / 로드맵 ──
  bell: `
    <path d="M7 22 L 7 14 C 7 9, 11 5, 16 5 C 21 5, 25 9, 25 14 L 25 22 L 27 25 L 5 25 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M14 25 L 18 25 C 18 27, 17 28, 16 28 C 15 28, 14 27, 14 25 Z" fill="{stroke}"/>
    <circle cx="22" cy="8" r="3" fill="{accent}" stroke="{stroke}" stroke-width="2"/>
  `,
  user: `
    <circle cx="16" cy="11" r="6" fill="none" stroke="{stroke}" stroke-width="2"/>
    <circle cx="16" cy="11" r="6" fill="{accent}" opacity="0.15"/>
    <path d="M4 28 C 4 21, 9 18, 16 18 C 23 18, 28 21, 28 28"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
  `,
  settings: `
    <path d="M13 3 L 19 3 L 20 7 L 23 8.5 L 27 6.5 L 30 11 L 27 14 L 27 18 L 30 21 L 27 25.5 L 23 23.5 L 20 25 L 19 29 L 13 29 L 12 25 L 9 23.5 L 5 25.5 L 2 21 L 5 18 L 5 14 L 2 11 L 5 6.5 L 9 8.5 L 12 7 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <circle cx="16" cy="16" r="5" fill="{accent}" stroke="{stroke}" stroke-width="2"/>
  `,
  group: `
    <circle cx="11" cy="12" r="4.5" fill="none" stroke="{stroke}" stroke-width="2"/>
    <circle cx="22" cy="13" r="3.5" fill="{accent}" stroke="{stroke}" stroke-width="2"/>
    <path d="M3 27 C 3 22, 6 19, 11 19 C 16 19, 19 22, 19 27" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M19 27 C 19 23, 21 21, 25 21 C 28 21, 29 23, 29 27" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
  `,
  heart: `
    <path d="M16 27 C 16 27, 4 20, 4 12 C 4 7, 7 4, 11 4 C 13.5 4, 15 5.5, 16 7 C 17 5.5, 18.5 4, 21 4 C 25 4, 28 7, 28 12 C 28 20, 16 27, 16 27 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
  `,
  "heart-fill": `
    <path d="M16 27 C 16 27, 4 20, 4 12 C 4 7, 7 4, 11 4 C 13.5 4, 15 5.5, 16 7 C 17 5.5, 18.5 4, 21 4 C 25 4, 28 7, 28 12 C 28 20, 16 27, 16 27 Z"
      fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
  `,
  ticket: `
    <path d="M3 10 L 29 10 L 29 14 C 27 14, 26 15, 26 16 C 26 17, 27 18, 29 18 L 29 22 L 3 22 L 3 18 C 5 18, 6 17, 6 16 C 6 15, 5 14, 3 14 Z"
      fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <line x1="12" y1="12" x2="12" y2="20" stroke="{stroke}" stroke-width="2" stroke-dasharray="2 2"/>
    <path d="M15 14 L 24 14 L 24 18 L 15 18 Z" fill="{accent}"/>
  `,
  "flight-ticket": `
    <rect x="3" y="8" width="26" height="17" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <rect x="3" y="8" width="26" height="5" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M9 19 L 14 17 L 15 15 L 17 15 L 16 18 L 20 17 L 21 15 L 23 15 L 22 19 L 23 20 L 21 21 L 19 20 L 15 21 L 14 20 L 10 21 Z"
      fill="{stroke}" stroke="{stroke}" stroke-width="1" stroke-linejoin="miter"/>
    <line x1="7" y1="10.5" x2="10" y2="10.5" stroke="{stroke}" stroke-width="1.5"/>
  `,
  passport: `
    <rect x="6" y="3" width="20" height="26" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <rect x="6" y="3" width="20" height="6" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <circle cx="16" cy="17" r="4" fill="none" stroke="{stroke}" stroke-width="2"/>
    <path d="M12 17 L 20 17 M 16 13 L 16 21 M 13 14 Q 16 17, 13 20 M 19 14 Q 16 17, 19 20"
      stroke="{stroke}" stroke-width="1.5" fill="none"/>
    <line x1="10" y1="25" x2="22" y2="25" stroke="{stroke}" stroke-width="2"/>
  `,
  suitcase: `
    <rect x="4" y="9" width="24" height="19" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <path d="M11 9 L 11 5 L 21 5 L 21 9" fill="none" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <rect x="4" y="14" width="24" height="4" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <line x1="10" y1="9" x2="10" y2="28" stroke="{stroke}" stroke-width="2"/>
    <line x1="22" y1="9" x2="22" y2="28" stroke="{stroke}" stroke-width="2"/>
  `,
  compass: `
    <circle cx="16" cy="16" r="12" fill="none" stroke="{stroke}" stroke-width="2"/>
    <path d="M16 8 L 19 16 L 16 24 L 13 16 Z" fill="{accent}" stroke="{stroke}" stroke-width="2" stroke-linejoin="miter"/>
    <circle cx="16" cy="16" r="1.5" fill="{stroke}"/>
    <line x1="16" y1="3" x2="16" y2="5" stroke="{stroke}" stroke-width="2"/>
    <line x1="16" y1="27" x2="16" y2="29" stroke="{stroke}" stroke-width="2"/>
    <line x1="3" y1="16" x2="5" y2="16" stroke="{stroke}" stroke-width="2"/>
    <line x1="27" y1="16" x2="29" y2="16" stroke="{stroke}" stroke-width="2"/>
  `,
};

export type CordixIconName = keyof typeof ICONS;

/**
 * 자체 듀오톤 아이콘 렌더러 — `stroke`(라인)와 `accent`(브랜드 오렌지 강조)
 * 두 색만 갈아끼우면 되는 구조라, 위험/성공 같은 문맥별 색 오버라이드가
 * lucide 아이콘 하나 바꾸는 것만큼 간단하다 (예: 삭제 버튼은 stroke/accent를
 * 둘 다 rose로 넘기면 됨).
 */
export function CordixIcon({
  name,
  size = 20,
  stroke = "currentColor",
  accent = "#EA5A2A",
  className,
}: {
  name: CordixIconName;
  size?: number;
  /** Outline color — defaults to currentColor so it inherits the surrounding text color like lucide icons do. */
  stroke?: string;
  /** Brand-orange accent fill used for the icon's focal shape (star fill, pin bulb, camera lens, …). */
  accent?: string;
  className?: string;
}) {
  const markup = ICONS[name];
  if (!markup) return null;
  const inner = markup.replaceAll("{stroke}", stroke).replaceAll("{accent}", accent);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      // Static, developer-authored markup only (never user input) — safe to inject directly.
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
