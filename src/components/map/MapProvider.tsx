"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Script from "next/script";
import type { Region } from "@/lib/types";
import { GOOGLE_MAPS_API_KEY, googleMapsScriptSrc, isGoogleMapsReady } from "@/lib/maps/google-map";
import { KAKAO_MAP_KEY, ensureKakaoMapsLoaded } from "@/lib/maps/kakao-map";

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

  const handleGoogleLoad = useCallback(() => {
    setIsLoaded(isGoogleMapsReady());
  }, []);

  const handleGoogleError = useCallback(() => {
    setLoadError(new Error("Failed to load Google Maps SDK"));
  }, []);

  // Kakao goes through the same page-lifetime-shared loader MapProvider.tsx
  // (the real one, at src/app/(app)/planner/MapProvider.tsx) uses — see its
  // doc comment for why a per-mount <Script onLoad> doesn't work for Kakao's
  // one-shot maps.load() init.
  useEffect(() => {
    if (resolved !== "kakao" || !KAKAO_MAP_KEY) return;
    let cancelled = false;
    ensureKakaoMapsLoaded()
      .then(() => {
        if (!cancelled) setIsLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [resolved]);

  return (
    <MapContext.Provider value={{ provider: resolved, isLoaded, loadError, isConfigured }}>
      {resolved === "google" && isConfigured && !isLoaded && !loadError && (
        <Script src={googleMapsScriptSrc()} strategy="afterInteractive" onLoad={handleGoogleLoad} onError={handleGoogleError} />
      )}
      {children}
    </MapContext.Provider>
  );
}
