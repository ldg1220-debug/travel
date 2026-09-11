"use client";

import { KakaoMapCanvas, KakaoOverlay, KakaoPolyline } from "./KakaoMapPrimitives";
import { liveCategoryBucket } from "@/lib/liveCategoryBucket";
import { MarkerContent, Pin } from "./MapMarkers";
import type { Place } from "@/lib/types";
import type { KakaoMapInstance } from "@/lib/maps/kakao-map";
import type { ClickedPlaceState, MapClickInfo, RouteLeg } from "./PlannerGoogleMap";

interface PlannerKakaoMapProps {
  mapsError: boolean;
  mapsLoaded: boolean;
  mapCenter: { lat: number; lng: number };
  onMapLoad: (map: KakaoMapInstance) => void;
  tab: "schedule" | "saved";
  routeLegs: RouteLeg[];
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
  /** Kakao's SDK has no equivalent to Google's labeled-POI-icon click, so `placeId` is always null here — the caller already falls back to a generic "선택한 위치" label whenever it is. */
  onMapClick: (info: MapClickInfo) => void;
  clickedPlace: ClickedPlaceState | null;
  onCloseClickedPlace: () => void;
  onSaveClickedPlace: () => void;
  onScheduleClickedPlace: () => void;
  /** 말풍선(요약)을 탭하면 같은 장소의 전체 상세 시트(PlaceDetailOverlay)를 연다 — 작업지시서 2026-09-09 "장소 상세 화면 통일" §3. */
  onOpenClickedPlaceDetail: () => void;
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
  routeLegs,
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
  onScheduleClickedPlace,
  onOpenClickedPlaceDetail,
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
          {/* 스톱 간 구간마다 따로 그린다 — 실제 도로 경로(leg.path)가 있으면
              실선, 없으면(아직 조회 중이거나 확인 안 됨) from→to 두 점을
              잇는 점선으로 대체한다. 작업지시서 2026-09-11 "계획 탭 동선을
              실제 경로로" §3 "경로 있음: 실선 / 경로 없음: 점선(추정 표시)". */}
          {routeLegs.map((leg, i) =>
            leg.path && leg.path.length >= 2 ? (
              <KakaoPolyline key={i} path={leg.path} strokeColor="#111827" strokeOpacity={0.9} strokeWeight={2} strokeStyle="solid" />
            ) : (
              <KakaoPolyline key={i} path={leg.fallbackPath} strokeColor="#111827" strokeOpacity={0.7} strokeWeight={2} strokeStyle="shortdash" />
            ),
          )}

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
                onActivate={onActivate}
              />
            </KakaoOverlay>
          ))}
        </>
      )}

      {tab === "saved" && (
        <>
          {savedPlaces.map((p) => (
            <KakaoOverlay key={p.id} position={{ lat: p.lat, lng: p.lng }}>
              <div
                role="button"
                tabIndex={0}
                aria-label={p.name}
                className="cursor-pointer touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                onClick={() => onSelectSaved(p.id)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  onSelectSaved(p.id);
                }}
              >
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

      {/* click-to-save/schedule popup — any coordinate tap on the map, either tab. PlannerGoogleMap.tsx와 같은 내용(§3 참고) — 카카오 SDK는 POI placeId를 안 주므로(위 onMapClick 주석) 실제로는 대부분 평점·카테고리 없이 이름만 나온다. */}
      {clickedPlace && (
        <KakaoOverlay position={{ lat: clickedPlace.place.lat, lng: clickedPlace.place.lng }} xAnchor={0.5} yAnchor={1.9} zIndex={20}>
          <div className="w-56 rounded-xl bg-white px-2.5 py-2 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              {/* 요약(말풍선) 탭 → 상세 시트 — 작업지시서 2026-09-09 "장소
                  상세 화면 통일" §3. */}
              <button type="button" onClick={onOpenClickedPlaceDetail} disabled={clickedPlace.loading} className="min-w-0 flex-1 text-left disabled:cursor-default">
                <p className="text-[13px] font-semibold text-slate-900">{clickedPlace.place.name}</p>
                {(clickedPlace.place.rating != null || clickedPlace.place.category) && (
                  <p className="text-[11px] text-slate-500">
                    {clickedPlace.place.rating != null && (
                      <>
                        ★{clickedPlace.place.rating.toFixed(1)}
                        {clickedPlace.place.reviewCount != null && ` (리뷰 ${clickedPlace.place.reviewCount.toLocaleString()})`}
                        {" · "}
                      </>
                    )}
                    {liveCategoryBucket(clickedPlace.place.category)}
                  </p>
                )}
                {clickedPlace.place.address && <p className="truncate text-[10.5px] text-slate-400">{clickedPlace.place.address}</p>}
              </button>
              <button onClick={onCloseClickedPlace} className="shrink-0 text-slate-300 hover:text-slate-500" aria-label="닫기">
                ✕
              </button>
            </div>
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={onScheduleClickedPlace}
                disabled={clickedPlace.loading}
                className="flex-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-40"
              >
                일정에 추가
              </button>
              <button
                onClick={onSaveClickedPlace}
                disabled={clickedPlace.loading}
                className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 disabled:opacity-40"
              >
                관심 장소에 저장
              </button>
            </div>
          </div>
        </KakaoOverlay>
      )}
    </KakaoMapCanvas>
  );
}
