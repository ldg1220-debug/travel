"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Script from "next/script";
import type { Region } from "@/lib/types";
import { GOOGLE_MAPS_API_KEY, googleMapsScriptSrc, isGoogleMapsReady } from "@/lib/maps/google-map";
import { KAKAO_MAP_KEY, kakaoMapScriptSrc, loadKakaoMaps } from "@/lib/maps/kakao-map";

export type MapProviderKind = "google" | "kakao";

interface MapContextValue {
  provider: MapProviderKind;
  /** False until the SDK's global (`google.maps` / `window.kakao.maps`) is actually usable. */
  isLoaded: boolean;
  loadError: Error | null;
  /** False when the relevant `NEXT_PUBLIC_*_MAP*_KEY` env var isn't set — distinct from "still loading". */
  isConfigured: boolean;
}

const MapContext = createContext<MapContextValue>({
  provider: "google",
  isLoaded: false,
  loadError: null,
  isConfigured: false,
});

export function useMapStatus() {
  return useContext(MapContext);
}

interface MapProviderProps {
  children: React.ReactNode;
  /** Pins one SDK explicitly. Takes priority over `region`. */
  provider?: MapProviderKind;
  /** international -> google, domestic -> kakao — the same convention
   * `src/store/itineraryStore.ts`'s `region` field uses elsewhere in the
   * app. Ignored if `provider` is set. Defaults to "google". */
  region?: Region;
}

/**
 * Loads exactly one map SDK at a time via `next/script` — never both — so
 * a screen picking between 국내/해외 doesn't pay to download the SDK it
 * isn't using. Consumers read `useMapStatus()` for `{ isLoaded, loadError,
 * isConfigured }` rather than assuming the global is ready as soon as this
 * component mounts.
 *
 * Only used by the /dev/map-test QA page — /planner and /discover use the
 * separate Google-only loader at src/app/(app)/planner/MapProvider.tsx
 * instead. Don't import this one from either of those; it exists purely
 * to let /dev/map-test exercise the Kakao SDK, which the real app doesn't
 * load at all.
 */
export function MapProvider({ children, provider, region }: MapProviderProps) {
  const resolved: MapProviderKind = provider ?? (region === "domestic" ? "kakao" : "google");
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const isConfigured = resolved === "google" ? Boolean(GOOGLE_MAPS_API_KEY) : Boolean(KAKAO_MAP_KEY);

  const handleLoad = useCallback(() => {
    if (resolved === "kakao") {
      loadKakaoMaps(() => setIsLoaded(true));
    } else {
      setIsLoaded(isGoogleMapsReady());
    }
  }, [resolved]);

  const handleError = useCallback(() => {
    setLoadError(new Error(`Failed to load ${resolved === "google" ? "Google" : "Kakao"} Maps SDK`));
  }, [resolved]);

  return (
    <MapContext.Provider value={{ provider: resolved, isLoaded, loadError, isConfigured }}>
      {isConfigured && !isLoaded && !loadError && (
        <Script
          src={resolved === "google" ? googleMapsScriptSrc() : kakaoMapScriptSrc()}
          strategy="afterInteractive"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {children}
    </MapContext.Provider>
  );
}
