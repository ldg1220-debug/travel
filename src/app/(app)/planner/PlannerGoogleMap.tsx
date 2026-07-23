"use client";

import { GoogleMap, InfoWindow, OverlayView, Polyline } from "@react-google-maps/api";
import { nudgeGoogleMapResize } from "@/lib/maps/mapResize";
import { MarkerContent, Pin } from "./MapMarkers";
import type { Place } from "@/lib/types";

/** A raw map click — `placeId` is only present when the click landed on a labeled POI icon. */
export interface MapClickInfo {
  lat: number;
  lng: number;
  placeId: string | null;
}

/** State for the click-to-save popup — `loading` while a POI's real name is still being fetched. */
export interface ClickedPlaceState {
  lat: number;
  lng: number;
  name: string;
  loading: boolean;
}

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
  onActivate: (place: Place) => void;
  savedPlaces: Place[];
  selectedSavedPlace: Place | null;
  onSelectSaved: (id: string | null) => void;
  /** Any coordinate or POI click on the map — lets the caller look up a POI's name and offer to save it as a 관심 장소. */
  onMapClick: (info: MapClickInfo) => void;
  clickedPlace: ClickedPlaceState | null;
  onCloseClickedPlace: () => void;
  onSaveClickedPlace: () => void;
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
  onActivate,
  savedPlaces,
  selectedSavedPlace,
  onSelectSaved,
  onMapClick,
  clickedPlace,
  onCloseClickedPlace,
  onSaveClickedPlace,
}: PlannerGoogleMapProps) {
  if (mapsError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
        지도를 불러오지 못했어요.
      </div>
    );
  }
  if (!mapsLoaded) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">지도 불러오는 중…</div>;
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
      onClick={(e) => {
        if (!e.latLng) return;
        // Clicking a labeled POI icon gives a MapMouseEvent with an extra
        // `placeId` (and a stop() to suppress the default Maps info
        // window) — a plain coordinate click has neither.
        const iconEvent = e as google.maps.IconMouseEvent;
        iconEvent.stop?.();
        onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng(), placeId: iconEvent.placeId ?? null });
      }}
      options={{ disableDefaultUI: true, zoomControl: true, clickableIcons: true }}
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
                onActivate={onActivate}
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
                role="button"
                tabIndex={0}
                aria-label={p.name}
                className="-translate-x-1/2 -translate-y-full cursor-pointer touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                onClick={() => onSelectSaved(p.id)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  onSelectSaved(p.id);
                }}
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

      {/* click-to-save popup — any coordinate or POI tap on the map, either tab */}
      {clickedPlace && (
        <InfoWindow position={{ lat: clickedPlace.lat, lng: clickedPlace.lng }} onCloseClick={onCloseClickedPlace}>
          <div className="min-w-[160px] px-1 py-0.5">
            <p className="text-[13px] font-semibold text-slate-900">{clickedPlace.name}</p>
            <p className="text-[10.5px] tabular-nums text-slate-400">
              {clickedPlace.lat.toFixed(5)}, {clickedPlace.lng.toFixed(5)}
            </p>
            <button
              onClick={onSaveClickedPlace}
              disabled={clickedPlace.loading}
              className="mt-2 w-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40"
            >
              관심 장소에 저장
            </button>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
