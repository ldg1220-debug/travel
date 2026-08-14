import type { MetadataRoute } from "next";

/**
 * PWA web app manifest (served at /manifest.webmanifest, auto-linked by Next).
 * Lets users "Add to Home Screen" and run Tradule as a standalone app, and is
 * the foundation for a later TWA/Capacitor store build. The icon files it
 * references live in public/brand/ — see public/brand/README.md for the exact
 * sizes to drop in (until then the manifest is valid but install prompts have
 * no custom icon).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tradule 트레쥴",
    short_name: "Tradule",
    description: "지도와 타임라인으로 여행 일정을 계획하세요.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    // 브랜드 오렌지(로고 그라데이션의 시작색) — 상태 표시줄/브라우저 크롬
    // 틴트라 텍스트 대비 규정이 적용되지 않으므로, 접근성 보정 없는 원색을
    // 그대로 쓴다. globals.css의 --color-brand-* 계산 근거 참고.
    theme_color: "#FF8A3D",
    lang: "ko",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
