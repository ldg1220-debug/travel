"use client";

import { KakaoMapCanvas, KakaoOverlay, KakaoPolyline } from "./KakaoMapPrimitives";
import { MarkerContent, Pin } from "./MapMarkers";
import type { Place } from "@/lib/types";
import type { KakaoMapInstance } from "@/lib/maps/kakao-map";
import type { ClickedPlaceState, MapClickInfo } from "./PlannerGoogleMap";

interface PlannerKakaoMapProps {
  mapsError: boolean;
  mapsLoaded: boolean;
  mapCenter: { lat: number; lng: number };
  onMapLoad: (map: KakaoMapInstance) => void;
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
  /** Kakao's SDK has no equivalent to Google's labeled-POI-icon click, so `placeId` is always null here — the caller already falls back to a generic "선택한 위치" label whenever it is. */
  onMapClick: (info: MapClickInfo) => void;
  clickedPlace: ClickedPlaceState | null;
  onCloseClickedPlace: () => void;
  onSaveClickedPlace: () => void;
}

/**
 * Kakao counterpart to PlannerGoogleMap.tsx, rendered instead of it whenever
 * the active plan's region is 국내(domestic) — see PlannerBoard.tsx. Always
 * loaded via `next/dynamic(..., { ssr: false })` from there, same reasoning
 * as the Google version. Reuses the exact same Pin/MarkerContent components
 * (they're plain React, not tied to either map SDK) so drag-to-schedule
 * interactions behave identically to the Google map.
 */
export default function PlannerKakaoMap({
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
  onMapClick,
  clickedPlace,
  onCloseClickedPlace,
  onSaveClickedPlace,
}: PlannerKakaoMapProps) {
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
    <KakaoMapCanvas
      center={mapCenter}
      level={8}
      onLoad={onMapLoad}
      onClick={(lat, lng) => onMapClick({ lat, lng, placeId: null })}
    >
      {tab === "schedule" && (
        <>
          {routePoints.length >= 2 && <KakaoPolyline path={routePoints} strokeColor="#111827" strokeOpacity={0.9} strokeWeight={2} />}

          {places.map((p) => (
            <KakaoOverlay key={p.id} position={{ lat: p.lat, lng: p.lng }} zIndex={pressingId === p.id ? 10 : undefined}>
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
            </KakaoOverlay>
          ))}
        </>
      )}

      {tab === "saved" && (
        <>
          {savedPlaces.map((p) => (
            <KakaoOverlay key={p.id} position={{ lat: p.lat, lng: p.lng }}>
              <div className="cursor-pointer touch-none select-none" onClick={() => onSelectSaved(p.id)}>
                <Pin place={p} />
              </div>
            </KakaoOverlay>
          ))}
          {selectedSavedPlace && (
            <KakaoOverlay position={{ lat: selectedSavedPlace.lat, lng: selectedSavedPlace.lng }} xAnchor={0.5} yAnchor={1.9} zIndex={20}>
              <div className="min-w-[140px] max-w-[220px] rounded-xl bg-white px-2.5 py-2 shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold text-slate-900">{selectedSavedPlace.name}</p>
                  <button onClick={() => onSelectSaved(null)} className="shrink-0 text-slate-300 hover:text-slate-500" aria-label="닫기">
                    ✕
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">{selectedSavedPlace.category}</p>
              </div>
            </KakaoOverlay>
          )}
        </>
      )}

      {/* click-to-save popup — any coordinate tap on the map, either tab */}
      {clickedPlace && (
        <KakaoOverlay position={{ lat: clickedPlace.lat, lng: clickedPlace.lng }} xAnchor={0.5} yAnchor={1.9} zIndex={20}>
          <div className="min-w-[160px] rounded-xl bg-white px-2.5 py-2 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-semibold text-slate-900">{clickedPlace.name}</p>
              <button onClick={onCloseClickedPlace} className="shrink-0 text-slate-300 hover:text-slate-500" aria-label="닫기">
                ✕
              </button>
            </div>
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
        </KakaoOverlay>
      )}
    </KakaoMapCanvas>
  );
}
