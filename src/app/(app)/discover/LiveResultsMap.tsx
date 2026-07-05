"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, InfoWindow, OverlayView } from "@react-google-maps/api";
import { ExternalLink, Star } from "lucide-react";
import { nudgeGoogleMapResize } from "@/lib/maps/mapResize";
import { useGoogleMapsStatus } from "@/app/(app)/planner/MapProvider";
import { Pin } from "@/app/(app)/planner/MapMarkers";
import type { Place } from "@/lib/types";

interface LiveResultsMapProps {
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** "상세·저장" in the flag popup — opens the full PlaceDetailOverlay owned by the page. */
  onOpenDetail: (place: Place) => void;
}

/** Stable signature of the current result set — the map only re-fits when the actual set of places changes, not on every parent re-render (popup open/close, sort re-order) which would otherwise lurch the camera. */
function idSignature(places: Place[]): string {
  return places
    .map((p) => p.id)
    .sort()
    .join("|");
}

/**
 * The 실시간 검색 결과 map — every live hit as a flag. Hovering a flag
 * (desktop) shows a light name/rating preview; clicking one selects it
 * and opens an action popup (메뉴·리뷰 link + 상세·저장). Tapping a card
 * in the list below selects its flag here, so list and map stay in sync.
 * Always loaded via `next/dynamic(..., { ssr: false })` from the page.
 */
export default function LiveResultsMap({ places, selectedId, onSelect, onOpenDetail }: LiveResultsMapProps) {
  const { isLoaded, loadError } = useGoogleMapsStatus();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // What the map is currently framed to — re-fit only when this changes.
  const fittedSigRef = useRef<string>("");

  const fitToPlaces = useCallback((map: google.maps.Map, list: Place[]) => {
    if (list.length === 0) return;
    if (list.length === 1) {
      map.panTo({ lat: list[0].lat, lng: list[0].lng });
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    list.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 48);
  }, []);

  // Re-fit ONLY when the underlying set of places actually changes (a new
  // search), keyed by a sorted id signature — re-renders from opening the
  // detail popup, sorting, or selecting a flag keep the same signature and
  // so never move the camera. This is the fix for "팝업 닫으면 다른 지역으로
  // 이동": nothing re-fits on close anymore.
  useEffect(() => {
    if (!mapRef.current) return;
    const sig = idSignature(places);
    if (sig !== fittedSigRef.current) {
      fittedSigRef.current = sig;
      fitToPlaces(mapRef.current, places);
    }
  }, [places, fitToPlaces]);

  // A list-card tap pans (not re-fits) to that flag. disableAutoPan on the
  // InfoWindow below keeps the *flag click itself* from also moving the
  // map, so only this explicit, intentional pan happens.
  useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const p = places.find((x) => x.id === selectedId);
    if (p) mapRef.current.panTo({ lat: p.lat, lng: p.lng });
  }, [selectedId, places]);

  if (loadError) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-400">지도를 불러오지 못했어요.</div>;
  }
  if (!isLoaded) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-400">지도 불러오는 중…</div>;
  }

  const selected = selectedId ? places.find((p) => p.id === selectedId) ?? null : null;
  // Hover preview only when a different flag than the selected one is hovered.
  const hovered = hoveredId && hoveredId !== selectedId ? places.find((p) => p.id === hoveredId) ?? null : null;

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={{ lat: places[0]?.lat ?? 37.5665, lng: places[0]?.lng ?? 126.978 }}
      zoom={13}
      onLoad={(map) => {
        mapRef.current = map;
        fittedSigRef.current = idSignature(places);
        fitToPlaces(map, places);
        nudgeGoogleMapResize(map, () => fitToPlaces(map, places));
      }}
      onClick={() => onSelect(null)}
      options={{ disableDefaultUI: true, zoomControl: true, clickableIcons: false }}
    >
      {places.map((p) => (
        <OverlayView key={p.id} position={{ lat: p.lat, lng: p.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
          <div
            className={`-translate-x-1/2 -translate-y-full cursor-pointer touch-none select-none transition-transform ${
              selectedId === p.id ? "z-10 scale-110 drop-shadow-lg" : hoveredId === p.id ? "scale-105 drop-shadow-md" : "drop-shadow"
            }`}
            onClick={(e) => {
              // Stop the map's own onClick (which clears selection) from
              // also firing under this flag.
              e.stopPropagation();
              onSelect(p.id);
            }}
            onMouseEnter={() => setHoveredId(p.id)}
            onMouseLeave={() => setHoveredId((cur) => (cur === p.id ? null : cur))}
          >
            <Pin place={p} solid={selectedId === p.id} />
          </div>
        </OverlayView>
      ))}

      {/* hover preview (desktop) — light, non-interactive, never moves the map */}
      {hovered && (
        <InfoWindow
          position={{ lat: hovered.lat, lng: hovered.lng }}
          options={{ disableAutoPan: true, pixelOffset: new google.maps.Size(0, -46) }}
        >
          <div className="max-w-[200px] px-0.5 py-0.5">
            <p className="text-[12.5px] font-semibold leading-snug text-slate-900">{hovered.name}</p>
            {hovered.rating != null && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <Star size={10} className="fill-amber-400 text-amber-400" />
                {hovered.rating.toFixed(1)}
                {hovered.reviewCount != null && <span className="font-normal text-slate-400">· 리뷰 {hovered.reviewCount.toLocaleString()}</span>}
              </p>
            )}
          </div>
        </InfoWindow>
      )}

      {/* click popup — the actionable one (메뉴 링크 + 상세·저장) */}
      {selected && (
        <InfoWindow
          position={{ lat: selected.lat, lng: selected.lng }}
          onCloseClick={() => onSelect(null)}
          options={{ disableAutoPan: true, pixelOffset: new google.maps.Size(0, -46) }}
        >
          <div className="min-w-[170px] max-w-[230px] px-1 py-0.5">
            <p className="text-[13px] font-semibold leading-snug text-slate-900">{selected.name}</p>
            {selected.address && <p className="mt-0.5 line-clamp-1 text-[10.5px] text-slate-400">{selected.address}</p>}
            {selected.rating != null && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <Star size={11} className="fill-amber-400 text-amber-400" />
                {selected.rating.toFixed(1)}
                {selected.reviewCount != null && (
                  <span className="font-normal text-slate-400">· 리뷰 {selected.reviewCount.toLocaleString()}</span>
                )}
              </p>
            )}
            <div className="mt-2 flex gap-1.5">
              {selected.googleMapsUri && (
                <a
                  href={selected.googleMapsUri}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600"
                >
                  <ExternalLink size={11} /> 메뉴·리뷰
                </a>
              )}
              <button
                onClick={() => onOpenDetail(selected)}
                className="flex h-7 flex-1 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-semibold text-white"
              >
                상세·저장
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
