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
// shape the app actually calls (mirrors the JS SDK's real API) — extended
// as needed rather than pulled in wholesale from a community @types package,
// same philosophy as the rest of this file.
export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

export interface KakaoPoint {
  x: number;
  y: number;
}

export interface KakaoMapInstance {
  setCenter(latlng: KakaoLatLng): void;
  getCenter(): KakaoLatLng;
  panTo(latlng: KakaoLatLng): void;
  setLevel(level: number): void;
  getLevel(): number;
  setBounds(bounds: KakaoLatLngBounds, padding?: number): void;
  relayout(): void;
  getProjection(): { pointFromCoords(latlng: KakaoLatLng): KakaoPoint };
}

export interface KakaoLatLngBounds {
  extend(latlng: KakaoLatLng): void;
}

export interface KakaoMarkerInstance {
  setMap(map: KakaoMapInstance | null): void;
  setPosition(latlng: KakaoLatLng): void;
}

export interface KakaoCustomOverlayInstance {
  setMap(map: KakaoMapInstance | null): void;
  setPosition(latlng: KakaoLatLng): void;
}

export interface KakaoPolylineInstance {
  setMap(map: KakaoMapInstance | null): void;
  setPath(path: KakaoLatLng[]): void;
}

export interface KakaoMouseEvent {
  latLng: KakaoLatLng;
}

interface KakaoMapsNamespace {
  load: (callback: () => void) => void;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMapInstance;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Marker: new (options: { position: KakaoLatLng; map?: KakaoMapInstance }) => KakaoMarkerInstance;
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement;
    map?: KakaoMapInstance;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
  }) => KakaoCustomOverlayInstance;
  Polyline: new (options: {
    path: KakaoLatLng[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    map?: KakaoMapInstance;
  }) => KakaoPolylineInstance;
  event: {
    addListener: (target: KakaoMapInstance, type: string, handler: (e: KakaoMouseEvent) => void) => void;
    removeListener: (target: KakaoMapInstance, type: string, handler: (e: KakaoMouseEvent) => void) => void;
    trigger: (target: KakaoMapInstance, type: string) => void;
  };
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

// MapProvider.tsx isn't a single page-level singleton — it gets mounted
// fresh every time a screen wraps something in <MapProvider> (the 딥 다이브
// overlay, a route preview modal, ...), each with its own local
// `kakaoLoaded` state. Without this module-level promise, every one of
// those remounts would re-render a `<Script onLoad=...>` and call
// `kakao.maps.load(callback)` again — and Kakao's `load()` is a one-shot
// init, not idempotent-per-caller, so any mount after the very first one
// would sit at "지도 로딩 중…" forever once the SDK was already loaded
// once elsewhere in the session. This promise is created once per page
// load and shared by every caller, so a mount that happens after the SDK
// is already ready resolves immediately instead of waiting on an event
// that will never fire again.
let kakaoMapsPromise: Promise<void> | null = null;

/** Idempotent — safe to call from every MapProvider mount. Only the very first caller actually injects the script tag and drives Kakao's two-step init; everyone else (including a mount that happens after the SDK is already loaded) just awaits the same shared promise. */
export function ensureKakaoMapsLoaded(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (!KAKAO_MAP_KEY) return Promise.reject(new Error("Kakao Maps key not configured"));
  if (kakaoMapsPromise) return kakaoMapsPromise;

  kakaoMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = kakaoMapScriptSrc();
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error("Kakao Maps SDK loaded but window.kakao.maps missing"));
        return;
      }
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () => reject(new Error("Failed to load Kakao Maps SDK"));
    document.head.appendChild(script);
  }).catch((err) => {
    // A failed load shouldn't permanently poison every future attempt —
    // clear the memo so a retry (e.g. next page navigation) can try again.
    kakaoMapsPromise = null;
    throw err;
  });
  return kakaoMapsPromise;
}

/** The live `kakao.maps` namespace — only call once `isKakaoMapsReady()` is true. */
export function getKakaoMaps(): KakaoMapsNamespace {
  if (!window.kakao) throw new Error("Kakao Maps SDK not loaded");
  return window.kakao.maps;
}

/**
 * Kakao's SDK has the same "measures container once, never again" quirk as
 * Google's (see mapResize.ts) — `map.relayout()` is its equivalent re-measure
 * call. Same double-rAF + timeout-fallback strategy.
 */
export function nudgeKakaoMapResize(map: KakaoMapInstance, after?: () => void): void {
  const fire = () => {
    map.relayout();
    after?.();
  };
  requestAnimationFrame(() => requestAnimationFrame(fire));
  setTimeout(fire, 250);
}
