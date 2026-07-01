"use client";

import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useKakaoMapsLoader } from "@/hooks/useKakaoMapsLoader";
import { PlaceMarker } from "../PlaceMarker";
import { FallbackMapEngine, MapMessage } from "./FallbackMapEngine";
import type { MapEngineProps } from "./types";
import type { Place } from "@/lib/types";

const KAKAO_MAP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";

/**
 * Domestic map engine. Kakao Maps has no React binding equivalent to
 * `@react-google-maps/api`, so this drives the SDK imperatively: a
 * `kakao.maps.CustomOverlay` per place (anchored top-left, like Google's
 * OverlayView) hosts a real React root rendering the exact same
 * <PlaceMarker> DOM — same tap/long-press-drag behavior as the
 * international map.
 */
export function KakaoMapEngine(props: MapEngineProps) {
  if (!KAKAO_MAP_KEY) {
    return <FallbackMapEngine {...props} providerLabel="Demo map · set NEXT_PUBLIC_KAKAO_MAP_KEY" />;
  }
  return <LiveKakaoMap {...props} />;
}

function centerOf(places: Place[]) {
  if (places.length === 0) return { lat: 37.5665, lng: 126.978 }; // Seoul
  const lat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
  const lng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
  return { lat, lng };
}

function LiveKakaoMap({ places, orderByPlace, routePoints, interactive, onShortPress }: MapEngineProps) {
  const { isLoaded, loadError } = useKakaoMapsLoader(KAKAO_MAP_KEY);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  // Create the map instance once, when the SDK becomes ready. The trend
  // list doesn't need to re-center/re-zoom the map after that.
  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapRef.current) return;
    const kakao = window.kakao;
    const c = centerOf(places);
    mapRef.current = new kakao.maps.Map(containerRef.current, {
      center: new kakao.maps.LatLng(c.lat, c.lng),
      level: 6,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setDraggable(interactive);
    mapRef.current.setZoomable(interactive);
  }, [interactive, isLoaded]);

  // Mount/refresh marker + polyline overlays imperatively via the SDK.
  useEffect(() => {
    if (!mapRef.current) return;
    const kakao = window.kakao;
    const map = mapRef.current;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markerOverlays: { overlay: any; root: Root }[] = [];
    for (const place of places) {
      const el = document.createElement("div");
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(place.lat, place.lng),
        content: el,
        xAnchor: 0,
        yAnchor: 0,
        zIndex: 10,
      });
      overlay.setMap(map);
      const root = createRoot(el);
      root.render(
        <PlaceMarker
          place={place}
          order={orderByPlace[place.id]}
          style={{ left: 0, top: 0 }}
          onShortPress={onShortPress}
        />,
      );
      markerOverlays.push({ overlay, root });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let polyline: any = null;
    if (routePoints.length >= 2) {
      polyline = new kakao.maps.Polyline({
        path: routePoints.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
        strokeWeight: 3,
        strokeColor: "#111827",
        strokeOpacity: 0.75,
        strokeStyle: "shortdash",
      });
      polyline.setMap(map);
    }

    return () => {
      polyline?.setMap(null);
      for (const { overlay, root } of markerOverlays) {
        overlay.setMap(null);
        root.unmount();
      }
    };
  }, [isLoaded, places, orderByPlace, routePoints, onShortPress]);

  if (loadError) return <MapMessage text="Failed to load Kakao Maps." />;

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {!isLoaded && (
        <div className="absolute inset-0">
          <MapMessage text="Loading map…" />
        </div>
      )}
    </div>
  );
}
