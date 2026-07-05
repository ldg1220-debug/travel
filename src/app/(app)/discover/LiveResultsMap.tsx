"use client";

import { useCallback, useEffect, useRef } from "react";
import { GoogleMap, InfoWindow } from "@react-google-maps/api";
import { OverlayView } from "@react-google-maps/api";
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

/**
 * The 실시간 검색 결과 map — every live hit as a flag; tapping a flag
 * opens a compact info popup (name/rating/메뉴 링크/상세), and tapping a
 * card in the list below selects its flag here, so the list and the map
 * always point at the same place. Always loaded via
 * `next/dynamic(..., { ssr: false })` from the page — same client-only
 * constraint as every other Maps canvas in this app.
 */
export default function LiveResultsMap({ places, selectedId, onSelect, onOpenDetail }: LiveResultsMapProps) {
  const { isLoaded, loadError } = useGoogleMapsStatus();
  const mapRef = useRef<google.maps.Map | null>(null);

  const fitToPlaces = useCallback(
    (map: google.maps.Map) => {
      if (places.length === 0) return;
      if (places.length === 1) {
        map.panTo({ lat: places[0].lat, lng: places[0].lng });
        map.setZoom(15);
        return;
      }
      const bounds = new google.maps.LatLngBounds();
      places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 48);
    },
    [places],
  );

  // Re-frame whenever the result set changes (new search, sort keeps the
  // same set so this is a no-op re-fit of identical bounds).
  useEffect(() => {
    if (mapRef.current) fitToPlaces(mapRef.current);
  }, [fitToPlaces]);

  // A list-card tap pans the map to that flag without re-fitting.
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

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={{ lat: places[0]?.lat ?? 37.5665, lng: places[0]?.lng ?? 126.978 }}
      zoom={13}
      onLoad={(map) => {
        mapRef.current = map;
        fitToPlaces(map);
        nudgeGoogleMapResize(map, () => fitToPlaces(map));
      }}
      onClick={() => onSelect(null)}
      options={{ disableDefaultUI: true, zoomControl: true, clickableIcons: false }}
    >
      {places.map((p) => (
        <OverlayView key={p.id} position={{ lat: p.lat, lng: p.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
          <div
            className={`-translate-x-1/2 -translate-y-full cursor-pointer touch-none select-none transition-transform ${
              selectedId === p.id ? "scale-110 drop-shadow-lg" : "drop-shadow"
            }`}
            onClick={() => onSelect(p.id)}
          >
            <Pin place={p} solid={selectedId === p.id} />
          </div>
        </OverlayView>
      ))}

      {selected && (
        <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => onSelect(null)}>
          <div className="min-w-[170px] max-w-[230px] px-1 py-0.5">
            <p className="text-[13px] font-semibold leading-snug text-slate-900">{selected.name}</p>
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
