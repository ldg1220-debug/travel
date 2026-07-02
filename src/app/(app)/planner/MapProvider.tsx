"use client";

import { createContext, useContext } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// Must be a stable reference — useJsApiLoader re-requests the script (and
// warns) if this array identity changes between renders.
const LIBRARIES: "places"[] = ["places"];

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
    id: "planner-google-map",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  return <MapContext.Provider value={{ isLoaded, loadError }}>{children}</MapContext.Provider>;
}
