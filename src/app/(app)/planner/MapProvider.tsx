"use client";

import { createContext, useContext } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

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

interface MapContextValue {
  isLoaded: boolean;
  loadError?: Error;
}

const MapContext = createContext<MapContextValue>({ isLoaded: false });

export function useGoogleMapsStatus() {
  return useContext(MapContext);
}

/**
 * Loads the Google Maps JS API script once at the top of the client tree
 * and exposes its ready state via context, so the map itself and its
 * marker overlays can render conditionally without each mounting their own
 * loader (and without re-requesting the script on every re-render).
 */
export function MapProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  return <MapContext.Provider value={{ isLoaded, loadError }}>{children}</MapContext.Provider>;
}
