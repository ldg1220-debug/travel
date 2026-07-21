"use client";

import { GoogleMap, OverlayView } from "@react-google-maps/api";
import { nudgeGoogleMapResize } from "@/lib/maps/mapResize";
import { isDomesticCoordinate } from "@/lib/maps/regionForCoords";
import { KakaoMapCanvas, KakaoOverlay, kakaoBoundsFor } from "./KakaoMapPrimitives";
import { Pin } from "./MapMarkers";
import type { Place } from "@/lib/types";
import type { KakaoMapInstance } from "@/lib/maps/kakao-map";

/** Tighter zoom (roughly street-level) when this place has no other 관심 장소 nearby to show context for; wider (neighborhood-level) when it does, so those other pins are actually visible on load instead of requiring a manual zoom-out. */
const SOLO_ZOOM = 15;
const WITH_NEARBY_ZOOM = 13;
// Kakao's zoom "level" is inverted from Google's (lower = more zoomed in) and
// on a different scale — these aren't a mathematical conversion, just Kakao
// levels that read as roughly the same framing intent as the Google zooms
// above.
const SOLO_LEVEL = 4;
const WITH_NEARBY_LEVEL = 6;

/**
 * The 딥 다이브 detail overlay's mini map — split out and always loaded via
 * `next/dynamic(..., { ssr: false })` from PlaceDetailOverlay.tsx, same
 * reasoning as PlannerGoogleMap.tsx: the Maps SDK/canvas must only ever
 * mount client-side, and `nudgeGoogleMapResize`/`nudgeKakaoMapResize`
 * recovers from a container that measured 0x0 because the bottom-sheet was
 * still animating in.
 *
 * Renders via Kakao Maps for a domestic place (`isDomesticCoordinate`) and
 * Google Maps for everywhere else — PlaceDetailOverlay gates on the right
 * SDK's loaded state before mounting this at all, so no loading/error
 * branch is needed here.
 *
 * `nearbyPlaces` (other saved 관심 장소 within a short radius, computed by
 * the caller) render as smaller secondary pins around the centered place,
 * so this reads as "this place and what's around it" instead of an
 * isolated dot with no geographic context.
 */
export default function PlaceMiniMap({
  place,
  nearbyPlaces = [],
  interactive = false,
}: {
  place: Place;
  nearbyPlaces?: Place[];
  /** Enables pan/zoom/scroll gestures — off by default (a static-looking preview), on for the tap-to-expand full-screen view. */
  interactive?: boolean;
}) {
  if (isDomesticCoordinate(place.lat, place.lng)) {
    return <PlaceMiniMapKakao place={place} nearbyPlaces={nearbyPlaces} interactive={interactive} />;
  }
  return <PlaceMiniMapGoogle place={place} nearbyPlaces={nearbyPlaces} interactive={interactive} />;
}

function PlaceMiniMapGoogle({ place, nearbyPlaces, interactive }: { place: Place; nearbyPlaces: Place[]; interactive: boolean }) {
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
      options={
        interactive
          ? { gestureHandling: "greedy" }
          : { disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false }
      }
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

// Kakao's map is draggable/zoomable by default (KakaoMapCanvas never
// disables gestures the way the Google branch explicitly does) — so
// `interactive` doesn't need to toggle anything here; it's only in the
// prop type to match PlaceMiniMap's shared interface.
function PlaceMiniMapKakao({ place, nearbyPlaces }: { place: Place; nearbyPlaces: Place[]; interactive: boolean }) {
  const level = nearbyPlaces.length > 0 ? WITH_NEARBY_LEVEL : SOLO_LEVEL;
  const handleLoad = (map: KakaoMapInstance) => {
    if (nearbyPlaces.length > 0) {
      map.setBounds(kakaoBoundsFor([place, ...nearbyPlaces]), 40);
    }
  };
  return (
    <KakaoMapCanvas key={place.id} center={{ lat: place.lat, lng: place.lng }} level={level} onLoad={handleLoad}>
      {nearbyPlaces.map((p) => (
        <KakaoOverlay key={p.id} position={{ lat: p.lat, lng: p.lng }}>
          <div className="-translate-x-1/2 -translate-y-full scale-75 opacity-90">
            <Pin place={p} />
          </div>
        </KakaoOverlay>
      ))}
    </KakaoMapCanvas>
  );
}
