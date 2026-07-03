"use client";

import { GoogleMap } from "@react-google-maps/api";
import { nudgeGoogleMapResize } from "@/lib/maps/mapResize";
import type { Place } from "@/lib/types";

/**
 * The 딥 다이브 detail overlay's mini map — split out and always loaded via
 * `next/dynamic(..., { ssr: false })` from PlaceDetailOverlay.tsx, same
 * reasoning as PlannerGoogleMap.tsx: the Maps SDK/canvas must only ever
 * mount client-side, and `nudgeGoogleMapResize` recovers from a container
 * that measured 0x0 because the bottom-sheet was still animating in.
 */
export default function PlaceMiniMap({ place }: { place: Place }) {
  return (
    <GoogleMap
      key={place.id}
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={{ lat: place.lat, lng: place.lng }}
      zoom={15}
      // Belt-and-suspenders alongside the center/zoom props above:
      // explicitly panTo/setZoom on load so this place's real
      // coordinates always win, never a stale default.
      onLoad={(map) => {
        map.panTo({ lat: place.lat, lng: place.lng });
        map.setZoom(15);
        nudgeGoogleMapResize(map, () => {
          map.panTo({ lat: place.lat, lng: place.lng });
          map.setZoom(15);
        });
      }}
      options={{ disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false }}
    />
  );
}
