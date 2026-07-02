"use client";

import { useEffect, useState } from "react";

const SCRIPT_ID = "kakao-maps-sdk";

declare global {
  interface Window {
    kakao: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

/** Injects the Kakao Maps JS SDK once and reports load state. */
export function useKakaoMapsLoader(appKey: string) {
  const [isLoaded, setIsLoaded] = useState(
    () => typeof window !== "undefined" && Boolean(window.kakao?.maps),
  );
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    if (!appKey || isLoaded) return;

    const onScriptLoad = () => window.kakao.maps.load(() => setIsLoaded(true));
    const onScriptError = () => setLoadError(new Error("Failed to load Kakao Maps SDK"));

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", onScriptLoad);
    script.addEventListener("error", onScriptError);

    return () => {
      script?.removeEventListener("load", onScriptLoad);
      script?.removeEventListener("error", onScriptError);
    };
  }, [appKey, isLoaded]);

  return { isLoaded, loadError };
}
