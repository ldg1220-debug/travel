"use client";

import { useCallback, useState } from "react";

export interface UserLocation {
  lat: number;
  lng: number;
}

/**
 * Requests the browser's Geolocation API on demand (never auto-prompts on
 * mount) — on Android this is backed by Google Play services' Fused
 * Location Provider, which is what makes "내 주변순" a genuine use of a
 * location API rather than just re-labeling the existing Kakao/Google
 * place-search calls. Coordinates never get persisted anywhere (no
 * localStorage, no server log) — they only ever flow into the one search
 * request that asked for them.
 */
export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback((onSuccess?: (loc: UserLocation) => void) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("이 환경에서는 위치 정보를 사용할 수 없어요");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        setLocating(false);
        onSuccess?.(loc);
      },
      () => {
        setError("위치 권한을 허용해야 사용할 수 있어요");
        setLocating(false);
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  return { location, locating, error, request };
}
