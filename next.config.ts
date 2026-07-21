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
const MAP_CONNECT_HOSTS = "https://maps.googleapis.com https://*.googleapis.com https://dapi.kakao.com https://*.daumcdn.net https://*.kakaocdn.net";

// 'unsafe-inline'/'unsafe-eval' are unfortunately required here — Next.js's
// own hydration script is inline, and the Google Maps JS SDK injects both
// inline scripts and inline styles for its UI controls. This is the same
// trade-off Google's own CSP guidance for Maps JS makes. img-src is left
// wide open (any https origin) rather than enumerating every photo CDN
// (Google Places, Kakao, OAuth avatars, Vercel Blob) — none of those can
// execute code, so the risk/benefit of locking that one down is poor.
const APP_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${MAP_SCRIPT_HOSTS}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${MAP_CONNECT_HOSTS}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
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
