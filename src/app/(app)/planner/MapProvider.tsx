"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Script from "next/script";
import { useJsApiLoader } from "@react-google-maps/api";
import { KAKAO_MAP_KEY, kakaoMapScriptSrc, loadKakaoMaps, isKakaoMapsReady } from "@/lib/maps/kakao-map";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// Must be a stable reference — useJsApiLoader re-requests the script (and
// warns) if this array identity changes between renders.
const LIBRARIES: "places"[] = ["places"];

// Deliberately app-wide (not "planner-only") and namespaced: this is the
// ONE Google Maps script loader for the whole app — /planner, /discover's
// route preview, and the 딥 다이브 detail overlay all share it via
// useGoogleMapsStatus() below, so the SDK is only ever requested once no
// matter how many of those mount. There's also a separate, unrelated
// Google/Kakao dual-loader at src/components/map/MapProvider.tsx used only
// by the /dev/map-test QA page — it is never imported from /planner or
// /discover, so it can't collide with this one; this id is namespaced
// defensively anyway in case that ever changes.
const GOOGLE_MAPS_LOADER_ID = "travel-scheduler-google-maps";

interface GoogleStatus {
  isLoaded: boolean;
  loadError?: Error;
}

interface KakaoStatus {
  isLoaded: boolean;
  loadError: Error | null;
}

interface MapContextValue {
  google: GoogleStatus;
  kakao: KakaoStatus;
}

const MapContext = createContext<MapContextValue>({
  google: { isLoaded: false },
  kakao: { isLoaded: false, loadError: null },
});

export function useGoogleMapsStatus(): GoogleStatus {
  return useContext(MapContext).google;
}

/** 국내(domestic) 장소 지도용 카카오맵 SDK 상태 — Google과 마찬가지로 이 Provider가 한 번만 스크립트를 로드하고 모든 소비자가 이 훅으로 공유한다. */
export function useKakaoMapsStatus(): KakaoStatus {
  return useContext(MapContext).kakao;
}

/**
 * Loads both map SDKs' scripts once at the top of the client tree and
 * exposes their ready state via context — Google for 해외(international)
 * places, Kakao for 국내(domestic) ones (see src/lib/maps/regionForCoords.ts
 * for how a screen decides which one a given place needs). Both load in
 * parallel rather than lazily per-region, since a single page (e.g.
 * /discover toggling 국내/해외) can need either one without a full remount.
 * Kakao's script is skipped entirely when NEXT_PUBLIC_KAKAO_MAP_KEY isn't
 * configured — screens needing it then just show their "not configured"
 * fallback instead of hanging on a load that will never happen.
 */
export function MapProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: googleLoaded, loadError: googleLoadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const [kakaoLoaded, setKakaoLoaded] = useState(false);
  const [kakaoLoadError, setKakaoLoadError] = useState<Error | null>(null);

  const handleKakaoScriptLoad = useCallback(() => {
    loadKakaoMaps(() => setKakaoLoaded(isKakaoMapsReady()));
  }, []);
  const handleKakaoScriptError = useCallback(() => {
    setKakaoLoadError(new Error("Failed to load Kakao Maps SDK"));
  }, []);

  return (
    <MapContext.Provider
      value={{
        google: { isLoaded: googleLoaded, loadError: googleLoadError },
        kakao: { isLoaded: kakaoLoaded, loadError: kakaoLoadError },
      }}
    >
      {KAKAO_MAP_KEY && !kakaoLoaded && !kakaoLoadError && (
        <Script src={kakaoMapScriptSrc()} strategy="afterInteractive" onLoad={handleKakaoScriptLoad} onError={handleKakaoScriptError} />
      )}
      {children}
    </MapContext.Provider>
  );
}
