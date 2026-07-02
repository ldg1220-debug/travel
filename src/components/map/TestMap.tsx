"use client";

import { useEffect, useRef } from "react";
import { MapProvider, useMapStatus, type MapProviderKind } from "./MapProvider";
import type { Region } from "@/lib/types";

// Fukuoka — a real coordinate this app's planner/discover mock data has
// used elsewhere, just so this test map centers somewhere plausible.
const DEFAULT_CENTER = { lat: 33.5904, lng: 130.4017 };

function GoogleTestCanvas() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    new google.maps.Map(ref.current, { center: DEFAULT_CENTER, zoom: 11 });
  }, []);
  return <div ref={ref} className="h-64 w-full rounded-2xl" />;
}

function KakaoTestCanvas() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current || !window.kakao?.maps) return;
    new window.kakao.maps.Map(ref.current, {
      center: new window.kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
      level: 6,
    });
  }, []);
  return <div ref={ref} className="h-64 w-full rounded-2xl" />;
}

function TestMapInner() {
  const { provider, isLoaded, loadError, isConfigured } = useMapStatus();
  const label = provider === "google" ? "Google Maps" : "Kakao Maps";

  if (!isConfigured) {
    return (
      <Placeholder tone="neutral">
        {provider === "google" ? "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY" : "NEXT_PUBLIC_KAKAO_MAP_KEY"} 미설정 — {label}{" "}
        건너뜀
      </Placeholder>
    );
  }
  if (loadError) {
    return <Placeholder tone="error">{loadError.message}</Placeholder>;
  }
  if (!isLoaded) {
    return <Placeholder tone="neutral">{label} SDK 로딩 중…</Placeholder>;
  }
  return provider === "google" ? <GoogleTestCanvas /> : <KakaoTestCanvas />;
}

function Placeholder({ tone, children }: { tone: "neutral" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={`flex h-64 w-full items-center justify-center rounded-2xl border border-dashed px-6 text-center text-sm ${
        tone === "error" ? "border-red-300 bg-red-50 text-red-600" : "border-slate-300 bg-slate-50 text-slate-500"
      }`}
    >
      {children}
    </div>
  );
}

interface TestMapProps {
  provider?: MapProviderKind;
  region?: Region;
}

/**
 * Render-smoke-test for src/components/map/MapProvider.tsx: mounts a real
 * map once the requested SDK is ready, or a clear status placeholder
 * otherwise (missing key / still loading / failed) — so switching between
 * Google and Kakao can be visually confirmed without needing to wire this
 * into a real screen first.
 */
export function TestMap({ provider, region }: TestMapProps) {
  return (
    <MapProvider provider={provider} region={region}>
      <TestMapInner />
    </MapProvider>
  );
}
