"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, InfoWindow, OverlayView } from "@react-google-maps/api";
import { ExternalLink } from "lucide-react";
import { CordixIcon } from "@/components/icons/CordixIcon";
import { nudgeGoogleMapResize } from "@/lib/maps/mapResize";
import { useGoogleMapsStatus, useKakaoMapsStatus } from "@/app/(app)/planner/MapProvider";
import { isDomesticCoordinate } from "@/lib/maps/regionForCoords";
import { KakaoMapCanvas, KakaoOverlay, kakaoBoundsFor } from "@/app/(app)/planner/KakaoMapPrimitives";
import { Pin } from "@/app/(app)/planner/MapMarkers";
import { getKakaoMaps, type KakaoMapInstance } from "@/lib/maps/kakao-map";
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
 * Renders via Kakao Maps when the results are domestic, Google otherwise
 * — see src/lib/maps/regionForCoords.ts.
 */
export default function LiveResultsMap(props: LiveResultsMapProps) {
  const { places } = props;
  const domestic = places.length > 0 && isDomesticCoordinate(places[0].lat, places[0].lng);
  const { isLoaded: googleLoaded, loadError: googleLoadError } = useGoogleMapsStatus();
  const { isLoaded: kakaoLoaded, loadError: kakaoLoadError } = useKakaoMapsStatus();
  const loadError = domestic ? kakaoLoadError : googleLoadError;
  const isLoaded = domestic ? kakaoLoaded : googleLoaded;

  if (loadError) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-400">지도를 불러오지 못했어요.</div>;
  }
  if (!isLoaded) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-400">지도 불러오는 중…</div>;
  }
  return domestic ? <LiveResultsMapKakao {...props} /> : <LiveResultsMapGoogle {...props} />;
}

function LiveResultsMapGoogle({ places, selectedId, onSelect, onOpenDetail }: LiveResultsMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // What the map is currently framed to — re-fit only when this changes.
  const fittedSigRef = useRef<string>("");
  const sig = idSignature(places);
  // Memoized on the result set — a fresh center object each render (e.g.
  // from a hover state change) made @react-google-maps/api re-apply
  // `center` and snap the camera back while the user was panning. Keyed on
  // the id signature so it only changes when the results actually do.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialCenter = useMemo(() => ({ lat: places[0]?.lat ?? 37.5665, lng: places[0]?.lng ?? 126.978 }), [sig]);

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

  const selected = selectedId ? places.find((p) => p.id === selectedId) ?? null : null;
  // Hover preview only when a different flag than the selected one is hovered.
  const hovered = hoveredId && hoveredId !== selectedId ? places.find((p) => p.id === hoveredId) ?? null : null;

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      // Memoized on the result set — a NEW center object each render (e.g.
      // from a hover state change) made @react-google-maps/api re-apply
      // `center` and snap the camera back to the first result while the
      // user was panning. Now it only changes when the results do.
      center={initialCenter}
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
                <CordixIcon name="star" size={10} stroke="#fbbf24" accent="#fbbf24" />
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
                <CordixIcon name="star" size={11} stroke="#fbbf24" accent="#fbbf24" />
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

function LiveResultsMapKakao({ places, selectedId, onSelect, onOpenDetail }: LiveResultsMapProps) {
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const fittedSigRef = useRef<string>("");

  const fitToPlaces = useCallback((map: KakaoMapInstance, list: Place[]) => {
    if (list.length === 0) return;
    if (list.length === 1) {
      map.setLevel(4);
      map.panTo(new (getKakaoMaps().LatLng)(list[0].lat, list[0].lng));
      return;
    }
    map.setBounds(kakaoBoundsFor(list), 48);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const sig = idSignature(places);
    if (sig !== fittedSigRef.current) {
      fittedSigRef.current = sig;
      fitToPlaces(mapRef.current, places);
    }
  }, [places, fitToPlaces]);

  useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const p = places.find((x) => x.id === selectedId);
    if (p) mapRef.current.panTo(new (getKakaoMaps().LatLng)(p.lat, p.lng));
  }, [selectedId, places]);

  const selected = selectedId ? places.find((p) => p.id === selectedId) ?? null : null;
  const hovered = hoveredId && hoveredId !== selectedId ? places.find((p) => p.id === hoveredId) ?? null : null;

  const initialCenter = { lat: places[0]?.lat ?? 37.5665, lng: places[0]?.lng ?? 126.978 };

  return (
    <KakaoMapCanvas
      center={initialCenter}
      level={6}
      onClick={() => onSelect(null)}
      onLoad={(map) => {
        mapRef.current = map;
        fittedSigRef.current = idSignature(places);
        fitToPlaces(map, places);
      }}
    >
      {places.map((p) => (
        <KakaoOverlay key={p.id} position={{ lat: p.lat, lng: p.lng }} zIndex={selectedId === p.id ? 10 : undefined}>
          <div
            className={`cursor-pointer touch-none select-none transition-transform ${
              selectedId === p.id ? "scale-110 drop-shadow-lg" : hoveredId === p.id ? "scale-105 drop-shadow-md" : "drop-shadow"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(p.id);
            }}
            onMouseEnter={() => setHoveredId(p.id)}
            onMouseLeave={() => setHoveredId((cur) => (cur === p.id ? null : cur))}
          >
            <Pin place={p} solid={selectedId === p.id} />
          </div>
        </KakaoOverlay>
      ))}

      {hovered && (
        <KakaoOverlay position={{ lat: hovered.lat, lng: hovered.lng }} xAnchor={0} yAnchor={1.6} zIndex={5}>
          <div className="pointer-events-none max-w-[200px] rounded-xl bg-white px-2.5 py-2 shadow-lg">
            <p className="text-[12.5px] font-semibold leading-snug text-slate-900">{hovered.name}</p>
            {hovered.rating != null && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <CordixIcon name="star" size={10} stroke="#fbbf24" accent="#fbbf24" />
                {hovered.rating.toFixed(1)}
                {hovered.reviewCount != null && <span className="font-normal text-slate-400">· 리뷰 {hovered.reviewCount.toLocaleString()}</span>}
              </p>
            )}
          </div>
        </KakaoOverlay>
      )}

      {selected && (
        <KakaoOverlay position={{ lat: selected.lat, lng: selected.lng }} xAnchor={0} yAnchor={1.6} zIndex={6}>
          <div className="min-w-[170px] max-w-[230px] rounded-xl bg-white px-2.5 py-2 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] font-semibold leading-snug text-slate-900">{selected.name}</p>
              <button onClick={() => onSelect(null)} className="shrink-0 text-slate-300 hover:text-slate-500" aria-label="닫기">
                ✕
              </button>
            </div>
            {selected.address && <p className="mt-0.5 line-clamp-1 text-[10.5px] text-slate-400">{selected.address}</p>}
            {selected.rating != null && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <CordixIcon name="star" size={11} stroke="#fbbf24" accent="#fbbf24" />
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
        </KakaoOverlay>
      )}
    </KakaoMapCanvas>
  );
}

