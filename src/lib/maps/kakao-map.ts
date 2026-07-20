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

/** Completes Kakao's two-step init (script loaded -> maps.load(callback)). */
export function loadKakaoMaps(onReady: () => void): void {
  if (typeof window === "undefined" || !window.kakao?.maps) return;
  window.kakao.maps.load(onReady);
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
