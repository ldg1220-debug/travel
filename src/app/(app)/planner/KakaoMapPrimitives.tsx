"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getKakaoMaps,
  nudgeKakaoMapResize,
  type KakaoMapInstance,
  type KakaoCustomOverlayInstance,
  type KakaoLatLngBounds,
} from "@/lib/maps/kakao-map";

/**
 * Minimal React bindings for the Kakao Maps JS SDK — there's no official
 * `@react-google-maps/api`-equivalent package for Kakao, so this hand-rolls
 * just the three pieces the app's map screens actually need: a map canvas,
 * a marker/popup overlay that can host arbitrary React content (via a
 * portal into Kakao's own `CustomOverlay` DOM node), and a route polyline.
 * Deliberately shaped to read like its Google counterparts
 * (PlannerGoogleMap.tsx etc.) so each screen's Kakao variant stays close to
 * a line-for-line port instead of a from-scratch rewrite.
 */

const KakaoMapContext = createContext<KakaoMapInstance | null>(null);

export function useKakaoMap(): KakaoMapInstance | null {
  return useContext(KakaoMapContext);
}

interface KakaoMapCanvasProps {
  center: { lat: number; lng: number };
  level: number;
  onLoad?: (map: KakaoMapInstance) => void;
  onClick?: (lat: number, lng: number) => void;
  className?: string;
  children?: React.ReactNode;
}

/** Constructs the `kakao.maps.Map` instance once and never again — re-centering afterwards is the caller's job via the `map` it gets from `onLoad`, same convention as `<GoogleMap>`. */
export function KakaoMapCanvas({ center, level, onLoad, onClick, className, children }: KakaoMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<KakaoMapInstance | null>(null);
  // Always-latest-callback ref, kept in sync via an effect (not during
  // render) — the click listener attached once below reads through this so
  // it never needs to be re-registered when the caller passes a new
  // `onClick` identity.
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    if (!containerRef.current) return;
    const kakaoMaps = getKakaoMaps();
    const instance = new kakaoMaps.Map(containerRef.current, {
      center: new kakaoMaps.LatLng(center.lat, center.lng),
      level,
    });
    kakaoMaps.event.addListener(instance, "click", (e) => {
      onClickRef.current?.(e.latLng.getLat(), e.latLng.getLng());
    });
    nudgeKakaoMapResize(instance, () => instance.setCenter(new kakaoMaps.LatLng(center.lat, center.lng)));
    onLoad?.(instance);
    setMap(instance);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- construct exactly once; center/level changes afterwards are the caller's responsibility via the `onLoad` map instance, same as <GoogleMap>
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }} className={className}>
      {map && <KakaoMapContext.Provider value={map}>{children}</KakaoMapContext.Provider>}
    </div>
  );
}

interface KakaoOverlayProps {
  position: { lat: number; lng: number };
  zIndex?: number;
  xAnchor?: number;
  yAnchor?: number;
  children: React.ReactNode;
}

/** A `CustomOverlay` whose content div is a portal target — lets ordinary React components (Pin, MarkerContent, popup cards, …) render as map overlays, same role as `<OverlayView>`/`<InfoWindow>` on the Google side. `xAnchor`/`yAnchor` default to 0/0 (content's top-left pinned to the coordinate) to match `<OverlayView>`'s convention, which `MarkerContent` already assumes. */
export function KakaoOverlay({ position, zIndex, xAnchor = 0, yAnchor = 0, children }: KakaoOverlayProps) {
  const map = useKakaoMap();
  const overlayRef = useRef<KakaoCustomOverlayInstance | null>(null);
  // A stable detached DOM node for the portal target — created once via the
  // useState lazy-initializer (safe to run logic in, unlike a ref default),
  // never reassigned afterwards.
  const [contentEl] = useState(() => document.createElement("div"));

  useEffect(() => {
    if (!map) return;
    const kakaoMaps = getKakaoMaps();
    const overlay = new kakaoMaps.CustomOverlay({
      position: new kakaoMaps.LatLng(position.lat, position.lng),
      content: contentEl,
      xAnchor,
      yAnchor,
      zIndex,
      map,
    });
    overlayRef.current = overlay;
    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- position updates are handled by the effect below; this one only (re)creates the overlay when the map instance itself changes
  }, [map]);

  useEffect(() => {
    if (!overlayRef.current) return;
    const kakaoMaps = getKakaoMaps();
    overlayRef.current.setPosition(new kakaoMaps.LatLng(position.lat, position.lng));
  }, [position.lat, position.lng]);

  return createPortal(children, contentEl);
}

interface KakaoPolylineProps {
  path: { lat: number; lng: number }[];
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  strokeStyle?: string;
}

export function KakaoPolyline({ path, strokeColor = "#4f46e5", strokeOpacity = 0.9, strokeWeight = 3, strokeStyle }: KakaoPolylineProps) {
  const map = useKakaoMap();
  const pathKey = path.map((p) => `${p.lat},${p.lng}`).join(";");

  useEffect(() => {
    if (!map || path.length === 0) return;
    const kakaoMaps = getKakaoMaps();
    const polyline = new kakaoMaps.Polyline({
      path: path.map((p) => new kakaoMaps.LatLng(p.lat, p.lng)),
      strokeWeight,
      strokeColor,
      strokeOpacity,
      strokeStyle,
      map,
    });
    return () => polyline.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathKey is the real dependency (stable string signature of `path`), re-listing `path` itself would defeat the point
  }, [map, pathKey, strokeColor, strokeOpacity, strokeWeight, strokeStyle]);

  return null;
}

/** `kakao.maps.LatLngBounds` built from a plain coordinate list — mirrors the `google.maps.LatLngBounds()` + `.extend()` dance used throughout the Google map screens. */
export function kakaoBoundsFor(points: { lat: number; lng: number }[]): KakaoLatLngBounds {
  const kakaoMaps = getKakaoMaps();
  const bounds = new kakaoMaps.LatLngBounds();
  points.forEach((p) => bounds.extend(new kakaoMaps.LatLng(p.lat, p.lng)));
  return bounds;
}
