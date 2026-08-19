import type { NextConfig } from "next";

// Every third-party origin the app actually loads a <script> from at
// runtime — Google Maps JS SDK, Kakao Maps JS SDK, Kakao's share SDK
// (카카오톡 공유하기, see src/lib/kakaoShare.ts). Everything else (fonts via
// next/font, Tailwind's compiled CSS, all API calls) is same-origin.
// Kakao Maps SDK loads with autoload=false, then kakao.maps.load(callback)
// pulls in its actual map-engine bundle from a *different* Kakao/Daum CDN
// host than the initial dapi.kakao.com script tag — exactly which one isn't
// documented, so this trusts the same *.kakaocdn.net/*.daumcdn.net wildcard
// already allowed for connect-src below. Narrower than that (just
// dapi.kakao.com + t1.kakaocdn.net) left the map stuck on "지도 로딩 중…"
// forever in production — the initial script tag's own onload still fires
// (so no onerror surfaces), but the internal load() call that depends on
// this second fetch never completes.
const MAP_SCRIPT_HOSTS =
  "https://maps.googleapis.com https://maps.gstatic.com https://dapi.kakao.com https://*.kakaocdn.net https://*.daumcdn.net";
// Runtime XHR/fetch destinations the Google/Kakao map SDKs themselves make
// for tile/place data, beyond the script hosts above.
const MAP_CONNECT_HOSTS =
  "https://maps.googleapis.com https://*.googleapis.com https://maps.gstatic.com https://*.gstatic.com https://dapi.kakao.com https://*.daumcdn.net https://*.kakaocdn.net";
// Travelpayouts Drive — 사이트 소유 확인 스크립트(layout.tsx의 인라인
// IIFE가 붙이는 <script src>, 작업지시서 2026-08-17). 이 CSP에 없어서
// 브라우저가 로드 자체를 차단하고 있었다(dev 콘솔에서 "Refused to load
// the script ... violates ... script-src" 직접 확인) — 배포본에서
// "요청이 광고 차단 확장에 막힌다"고 오판했던 실패의 실제 원인이 이거였을
// 가능성이 높다(afterInteractive→beforeInteractive→원시 인라인, 세 번
// 전략을 바꿔도 CSP 위반은 전략과 무관하게 계속 발생했을 것). 이 스크립트
// 자체가 클릭·검색 추적 목적으로 자기 도메인에 추가로 fetch/beacon을
// 보낼 수 있어(작업지시서 3장 "기능 잠금 해제 — 클릭·검색 추적") connect-src
// 에도 같이 열어둔다 — 실제로 다른 호스트로 더 나가는 게 확인되면 그때
// 추가한다.
const TP_DRIVE_HOST = "https://emrldtp.com";

// 'unsafe-inline'/'unsafe-eval' are unfortunately required here — Next.js's
// own hydration script is inline, and the Google Maps JS SDK injects both
// inline scripts and inline styles for its UI controls. This is the same
// trade-off Google's own CSP guidance for Maps JS makes. img-src is left
// wide open (any https origin) rather than enumerating every photo CDN
// (Google Places, Kakao, OAuth avatars, Vercel Blob) — none of those can
// execute code, so the risk/benefit of locking that one down is poor.
const APP_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${MAP_SCRIPT_HOSTS} ${TP_DRIVE_HOST}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${MAP_CONNECT_HOSTS} ${TP_DRIVE_HOST}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  // 'self' 만으로는 카카오톡 공유(src/lib/kakaoShare.ts)가 깨진다 — 카카오
  // JS SDK는 Share.sendDefault() 호출 시 새로 띄운 팝업에 sharer.kakao.com
  // 으로 향하는 폼을 만들어 제출하는 방식으로 공유 카드를 구성하는데,
  // form-action이 이 도메인을 안 걸어두면 브라우저가 그 제출 자체를 막아서
  // 팝업이 about:blank로 남는다(실사용 중 재현·콘솔에서 CSP 위반으로 확인됨).
  "form-action 'self' https://sharer.kakao.com",
  "frame-ancestors 'none'",
].join("; ");

// User-uploaded photos are served back through /api/blob/[...path] (see
// that route's doc comment) — its response is never meant to run as its
// own document/script context, only to be embedded as an <img>. `sandbox`
// with no allow-* tokens blocks scripts/forms/popups outright if it's ever
// opened as a top-level navigation, on top of the upload-time magic-byte
// check (src/lib/server/imageSniff.ts) that already rejects anything that
// isn't a real raster image.
const BLOB_CSP = "default-src 'none'; sandbox";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: APP_CSP },
        ],
      },
      {
        source: "/api/blob/:path*",
        headers: [
          { key: "Content-Security-Policy", value: BLOB_CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
