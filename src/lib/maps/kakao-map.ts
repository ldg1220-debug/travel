/**
 * Kakao Maps JS SDK loading config — the counterpart to google-map.ts.
 * Kakao's SDK, unlike Google's, doesn't finish initializing by the time
 * the script tag's own `load` event fires: with `autoload=false` (used
 * here on purpose, so it doesn't start initializing before our own
 * `<Script onLoad>` handler runs) you must explicitly call
 * `kakao.maps.load(callback)` afterwards. `loadKakaoMaps` below wraps
 * that second step so MapProvider.tsx doesn't need to know about it.
 */

export const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";

const KAKAO_MAP_LIBRARIES = ["services"] as const;

// The Kakao Maps SDK has no official TypeScript types; this is the minimal
// shape the app actually calls (mirrors the JS SDK's real API).
interface KakaoMapsNamespace {
  load: (callback: () => void) => void;
  Map: new (container: HTMLElement, options: { center: unknown; level: number }) => unknown;
  LatLng: new (lat: number, lng: number) => unknown;
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMapsNamespace };
  }
}

export function kakaoMapScriptSrc(): string {
  const params = new URLSearchParams({
    appkey: KAKAO_MAP_KEY,
    libraries: KAKAO_MAP_LIBRARIES.join(","),
    autoload: "false",
  });
  return `https://dapi.kakao.com/v2/maps/sdk.js?${params.toString()}`;
}

export function isKakaoMapsReady(): boolean {
  return typeof window !== "undefined" && Boolean(window.kakao?.maps);
}

/** Completes Kakao's two-step init (script loaded -> maps.load(callback)). */
export function loadKakaoMaps(onReady: () => void): void {
  if (typeof window === "undefined" || !window.kakao?.maps) return;
  window.kakao.maps.load(onReady);
}
