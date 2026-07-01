"use client";

import { GoogleMapEngine } from "./GoogleMapEngine";
import { KakaoMapEngine } from "./KakaoMapEngine";
import type { MapEngineProps } from "./types";
import type { Region } from "@/lib/types";

interface MapProviderProps extends MapEngineProps {
  region: Region;
}

/**
 * Common map interface used by the scheduler. Swaps the rendering engine
 * based on the selected region tab — Google Maps for international trips,
 * Kakao Maps for domestic — without the rest of the app knowing which one
 * is mounted.
 */
export function MapProvider({ region, ...engineProps }: MapProviderProps) {
  if (region === "domestic") {
    return <KakaoMapEngine {...engineProps} />;
  }
  return <GoogleMapEngine {...engineProps} />;
}
