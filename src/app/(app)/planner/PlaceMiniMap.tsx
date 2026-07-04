"use client";

import { GoogleMap, OverlayView } from "@react-google-maps/api";
import { nudgeGoogleMapResize } from "@/lib/maps/mapResize";
import { Pin } from "./MapMarkers";
import type { Place } from "@/lib/types";

/** Tighter zoom (roughly street-level) when this place has no other 관심 장소 nearby to show context for; wider (neighborhood-level) when it does, so those other pins are actually visible on load instead of requiring a manual zoom-out. */
const SOLO_ZOOM = 15;
const WITH_NEARBY_ZOOM = 13;

/**
 * The 딥 다이브 detail overlay's mini map — split out and always loaded via
 * `next/dynamic(..., { ssr: false })` from PlaceDetailOverlay.tsx, same
 * reasoning as PlannerGoogleMap.tsx: the Maps SDK/canvas must only ever
 * mount client-side, and `nudgeGoogleMapResize` recovers from a container
 * that measured 0x0 because the bottom-sheet was still animating in.
 *
 * `nearbyPlaces` (other saved 관심 장소 within a short radius, computed by
 * the caller) render as smaller secondary pins around the centered place,
 * so this reads as "this place and what's around it" instead of an
 * isolated dot with no geographic context.
 */
export default function PlaceMiniMap({ place, nearbyPlaces = [] }: { place: Place; nearbyPlaces?: Place[] }) {
  const zoom = nearbyPlaces.length > 0 ? WITH_NEARBY_ZOOM : SOLO_ZOOM;
  return (
    <GoogleMap
      key={place.id}
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={{ lat: place.lat, lng: place.lng }}
      zoom={zoom}
      // Belt-and-suspenders alongside the center/zoom props above:
      // explicitly panTo/setZoom on load so this place's real
      // coordinates always win, never a stale default.
      onLoad={(map) => {
        map.panTo({ lat: place.lat, lng: place.lng });
        map.setZoom(zoom);
        nudgeGoogleMapResize(map, () => {
          map.panTo({ lat: place.lat, lng: place.lng });
          map.setZoom(zoom);
        });
      }}
      options={{ disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false }}
    >
      {nearbyPlaces.map((p) => (
        <OverlayView key={p.id} position={{ lat: p.lat, lng: p.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
          <div className="-translate-x-1/2 -translate-y-full scale-75 opacity-90">
            <Pin place={p} />
          </div>
        </OverlayView>
      ))}
    </GoogleMap>
  );
}
