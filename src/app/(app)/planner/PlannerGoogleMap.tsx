"use client";

import { GoogleMap, InfoWindow, OverlayView, Polyline } from "@react-google-maps/api";
import { nudgeGoogleMapResize } from "@/lib/maps/mapResize";
import { MarkerContent, Pin } from "./MapMarkers";
import type { Place } from "@/lib/types";

interface PlannerGoogleMapProps {
  mapsError: boolean;
  mapsLoaded: boolean;
  mapCenter: { lat: number; lng: number };
  onMapLoad: (map: google.maps.Map) => void;
  tab: "schedule" | "saved";
  routePoints: { lat: number; lng: number }[];
  places: Place[];
  orderByPlace: Record<string, number>;
  pressingId: string | null;
  draggingPlaceId: string | null;
  onDown: (place: Place, e: React.PointerEvent) => void;
  onUp: (place: Place) => void;
  onMove: (e: React.PointerEvent) => void;
  onCancel: () => void;
  savedPlaces: Place[];
  selectedSavedPlace: Place | null;
  onSelectSaved: (id: string | null) => void;
}

/**
 * The actual `<GoogleMap>` render, split out of PlannerBoard.tsx and always
 * loaded via `next/dynamic(..., { ssr: false })` from there — this
 * guarantees the Maps SDK/canvas is never part of the server-rendered
 * (or hydration-replayed) HTML, only ever mounted client-side once the
 * container's real layout exists. Combined with `nudgeGoogleMapResize` in
 * `onLoad`, this covers both requested guarantees: client-only rendering,
 * and recovering from a container that briefly measured 0x0.
 */
export default function PlannerGoogleMap({
  mapsError,
  mapsLoaded,
  mapCenter,
  onMapLoad,
  tab,
  routePoints,
  places,
  orderByPlace,
  pressingId,
  draggingPlaceId,
  onDown,
  onUp,
  onMove,
  onCancel,
  savedPlaces,
  selectedSavedPlace,
  onSelectSaved,
}: PlannerGoogleMapProps) {
  if (mapsError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
        Failed to load Google Maps.
      </div>
    );
  }
  if (!mapsLoaded) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading map…</div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={mapCenter}
      zoom={11}
      onLoad={(map) => {
        onMapLoad(map);
        nudgeGoogleMapResize(map, () => map.setCenter(mapCenter));
      }}
      options={{ disableDefaultUI: true, zoomControl: true }}
    >
      {tab === "schedule" && (
        <>
          {routePoints.length >= 2 && (
            <Polyline
              path={routePoints}
              options={{
                strokeOpacity: 0,
                icons: [
                  {
                    icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#111827", scale: 3 },
                    offset: "0",
                    repeat: "14px",
                  },
                ],
              }}
            />
          )}

          {places.map((p) => (
            <OverlayView key={p.id} position={{ lat: p.lat, lng: p.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
              <MarkerContent
                place={p}
                order={orderByPlace[p.id]}
                pressing={pressingId === p.id}
                hidden={draggingPlaceId === p.id}
                onDown={onDown}
                onUp={onUp}
                onMove={onMove}
                onCancel={onCancel}
              />
            </OverlayView>
          ))}
        </>
      )}

      {tab === "saved" && (
        <>
          {savedPlaces.map((p) => (
            <OverlayView key={p.id} position={{ lat: p.lat, lng: p.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
              <div
                className="-translate-x-1/2 -translate-y-full cursor-pointer touch-none select-none"
                onClick={() => onSelectSaved(p.id)}
              >
                <Pin place={p} />
              </div>
            </OverlayView>
          ))}
          {selectedSavedPlace && (
            <InfoWindow
              position={{ lat: selectedSavedPlace.lat, lng: selectedSavedPlace.lng }}
              onCloseClick={() => onSelectSaved(null)}
            >
              <div className="px-1 py-0.5">
                <p className="text-[13px] font-semibold text-slate-900">{selectedSavedPlace.name}</p>
                <p className="text-[11px] text-slate-500">{selectedSavedPlace.category}</p>
              </div>
            </InfoWindow>
          )}
        </>
      )}
    </GoogleMap>
  );
}
