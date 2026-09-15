"use client";

import { GoogleMap, InfoWindow, OverlayView, Polyline } from "@react-google-maps/api";
import { nudgeGoogleMapResize } from "@/lib/maps/mapResize";
import { liveCategoryBucket } from "@/lib/liveCategoryBucket";
import { ROUTE_LEG_COLORS_HEX } from "@/lib/mapRouteColors";
import { MarkerContent, Pin } from "./MapMarkers";
import type { Place } from "@/lib/types";

/** A raw map click — `placeId` is only present when the click landed on a labeled POI icon. */
export interface MapClickInfo {
  lat: number;
  lng: number;
  placeId: string | null;
}

/**
 * State for the click-to-save/schedule popup — `place` carries whatever is
 * known so far (a bare lat/lng placeholder while `loading`, or the full
 * `/api/places/search?placeId=` result once it resolves: rating, category,
 * address, photo — same shape the 탐색 탭 cards use). 작업지시서 2026-09-09
 * "계획 탭 지도에서 장소 정보가 좌표만 나옵니다" §3 — 예전엔 lat/lng/name
 * 만 들고 있어 좌표만 보이는 말풍선이 됐다.
 */
export interface ClickedPlaceState {
  place: Place;
  loading: boolean;
}

/**
 * 계획 탭 지도가 그리는 스톱 간 구간 하나 — 작업지시서 2026-09-11 "계획
 * 탭 동선을 실제 경로로" §2/§3: 예전엔 스톱을 전부 이은 직선(점선) 하나
 * 뿐이라 산·바다·강을 그냥 가로질렀다. `path`가 있으면(/api/routes가
 * 실제 도로 경로를 찾아준 경우) 그 좌표열을 실선으로, 없으면(아직
 * 조회 중이거나 경로를 못 찾음) `fallbackPath`(두 점을 잇는 점선 직선)로
 * 대체한다 — "경로 있음: 실선, 경로 없음: 점선"으로 사용자가 어느 구간이
 * 실제 값인지 구분할 수 있게 한다(§3 "점선을 '추정' 표시로 쓰세요").
 *
 * `fallbackPath`를 매 렌더 `[from, to]`로 새로 만들지 않고 미리 튜플로
 * 담아둔다 — 작업지시서 2026-09-11 "해외 경로가 조용히 직선으로 떨어지고
 * 있습니다" §4: react-google-maps/api의 `<Polyline>`은 `path`/`options`
 * prop의 "참조"가 바뀔 때마다 내부적으로 setPath/setOptions를 다시
 * 불러(node_modules 확인) 렌더마다 새 배열을 넘기면 값이 그대로여도
 * 계속 다시 그려지다 못해 사라진 것처럼 보이는 실제 버그로 이어졌다.
 * 호출부(PlannerBoard.tsx)가 이 배열을 한 번만 만들어 넘겨야 이 이점이
 * 산다.
 */
export interface RouteLeg {
  fallbackPath: [{ lat: number; lng: number }, { lat: number; lng: number }];
  path: { lat: number; lng: number }[] | null;
  /**
   * true면 path가 있어도(직선 폴백이 두 점을 그대로 채워 돌려주므로)
   * 실제 경로가 아니라 추정이다 — 작업지시서 2026-09-15 "도보 구간이
   * 직선으로 그려집니다" §4: "path===null"만 보고 실선/점선을 가르면
   * 직선 폴백(path에 출발·도착 2점이 채워짐)이 실선으로 그려진다.
   * 서버(fetchLegRoute)가 명시하는 이 값을 대신 쓴다.
   */
  estimated: boolean;
}

// 위와 같은 이유로 옵션 객체도 렌더마다 새로 만들지 않는다 — 매번 값이
// 같은 상수라 모듈 스코프로 뺄 수 있다.
//
// 작업지시서 2026-09-15 "공유 품질 4건" §3 ★★ — 모든 구간이 같은 검정
// 실선이라 1→2→3→4가 겹쳐 지날 때 어느 구간인지 구분이 안 됐다. 구간
// 인덱스(routeLegs.map의 i)로 ROUTE_LEG_COLORS_HEX를 순환시켜 구간마다
// 다른 색을 쓰고, 진행 방향 화살표도 추가한다. `google.maps.SymbolPath.
// FORWARD_CLOSED_ARROW`(런타임 열거값)를 직접 쓰지 않는다 — 이 모듈은
// 지도 SDK 스크립트가 로드되기 전(모듈 평가 시점)에도 import되므로, 기존
// 점선 아이콘("M 0,-1 0,1")과 같은 이유로 원시 SVG path 문자열을 직접
// 쓴다(오른쪽을 향하는 삼각형 — Polyline의 icons가 구간 진행 방향으로
// 자동 회전시켜준다).
const FORWARD_ARROW_SVG_PATH = "M -3,-2 L 3,0 L -3,2 Z";
const ROUTE_LEG_SOLID_OPTIONS_BY_COLOR: google.maps.PolylineOptions[] = ROUTE_LEG_COLORS_HEX.map((color) => ({
  strokeColor: color,
  strokeOpacity: 0.85,
  strokeWeight: 4,
  icons: [{ icon: { path: FORWARD_ARROW_SVG_PATH, strokeColor: color, fillColor: color, fillOpacity: 1, scale: 1.4 }, offset: "50%", repeat: "160px" }],
}));
const ROUTE_LEG_DASHED_OPTIONS_BY_COLOR: google.maps.PolylineOptions[] = ROUTE_LEG_COLORS_HEX.map((color) => ({
  strokeOpacity: 0,
  icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: color, scale: 3 }, offset: "0", repeat: "14px" }],
}));

interface PlannerGoogleMapProps {
  mapsError: boolean;
  mapsLoaded: boolean;
  mapCenter: { lat: number; lng: number };
  onMapLoad: (map: google.maps.Map) => void;
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
  /** Any coordinate or POI click on the map — lets the caller look up a POI's name and offer to save it as a 관심 장소. */
  onMapClick: (info: MapClickInfo) => void;
  clickedPlace: ClickedPlaceState | null;
  onCloseClickedPlace: () => void;
  onSaveClickedPlace: () => void;
  onScheduleClickedPlace: () => void;
  /** 말풍선(요약)을 탭하면 같은 장소의 전체 상세 시트(PlaceDetailOverlay)를 연다 — 작업지시서 2026-09-09 "장소 상세 화면 통일" §3. */
  onOpenClickedPlaceDetail: () => void;
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
          {/* 스톱 간 구간마다 따로 그린다 — 실제 도로 경로(leg.path)가 있으면
              실선, 없으면(아직 조회 중이거나 확인 안 됨) from→to 두 점을
              잇는 점선으로 대체한다. 작업지시서 2026-09-11 "계획 탭 동선을
              실제 경로로" §3 "경로 있음: 실선 / 경로 없음: 점선(추정 표시)".
              실선/점선 판정은 leg.estimated(서버 명시값)를 쓴다 —
              작업지시서 2026-09-15 "도보 구간이 직선으로 그려집니다" §4:
              직선 폴백도 path에 출발·도착 2점을 채워 돌려주므로
              "path 존재 여부"만으로는 실선/점선을 못 가른다. */}
          {routeLegs.map((leg, i) =>
            !leg.estimated && leg.path && leg.path.length >= 2 ? (
              <Polyline key={i} path={leg.path} options={ROUTE_LEG_SOLID_OPTIONS_BY_COLOR[i % ROUTE_LEG_SOLID_OPTIONS_BY_COLOR.length]} />
            ) : (
              <Polyline key={i} path={leg.fallbackPath} options={ROUTE_LEG_DASHED_OPTIONS_BY_COLOR[i % ROUTE_LEG_DASHED_OPTIONS_BY_COLOR.length]} />
            ),
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

      {/* click-to-save/schedule popup — any coordinate or POI tap on the map, either tab. 탐색 탭 카드와 같은 정보(평점·리뷰수·카테고리·주소·사진)를 보여준다 — 작업지시서 2026-09-09 "계획 탭 지도에서 장소 정보가 좌표만 나옵니다" §3: 예전엔 이름과 좌표뿐이었다. */}
      {clickedPlace && (
        <InfoWindow position={{ lat: clickedPlace.place.lat, lng: clickedPlace.place.lng }} onCloseClick={onCloseClickedPlace}>
          <div className="w-56 px-1 py-0.5">
            {/* 요약(말풍선) 탭 → 상세 시트 — 작업지시서 2026-09-09 "장소
                상세 화면 통일" §3: "말풍선(요약) → 누르면 → 상세 시트(전체)".
                버튼 2개는 그대로 빠른 액션으로 남기고, 정보 영역 전체를
                눌러도 같은 상세 시트가 열리게 한다. */}
            <button type="button" onClick={onOpenClickedPlaceDetail} disabled={clickedPlace.loading} className="block w-full text-left disabled:cursor-default">
              {clickedPlace.place.photoName && (
                // eslint-disable-next-line @next/next/no-img-element -- /api/places/photo 프록시(구글 키가 클라이언트에 노출되지 않게)
                <img
                  src={`/api/places/photo?name=${encodeURIComponent(clickedPlace.place.photoName)}&w=240`}
                  alt={clickedPlace.place.name}
                  className="mb-1.5 h-24 w-full rounded-lg object-cover"
                />
              )}
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
              {/* 좌표는 사용자에게 보여줄 정보가 아니다 — 주소로 대체(작업지시서 §3 표). */}
              {clickedPlace.place.address && <p className="truncate text-[10.5px] text-slate-400">{clickedPlace.place.address}</p>}
            </button>
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
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
