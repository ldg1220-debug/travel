"use client";

import { GoogleMap, OverlayView, Polyline } from "@react-google-maps/api";
import { useGoogleMapsStatus } from "@/app/(app)/planner/MapProvider";
import { nudgeGoogleMapResize } from "@/lib/maps/mapResize";
import type { DiscoverRouteStop } from "@/lib/discoverData";

/**
 * The route preview modal's polyline map — split out and always loaded via
 * `next/dynamic(..., { ssr: false })` from discover/page.tsx, same
 * reasoning as PlannerGoogleMap.tsx/PlaceMiniMap.tsx: never part of the
 * server-rendered HTML, and `nudgeGoogleMapResize` recovers from a
 * container that measured 0x0 while the modal was still animating in.
 */
export default function RoutePreviewMap({ stops }: { stops: DiscoverRouteStop[] }) {
  const { isLoaded, loadError } = useGoogleMapsStatus();
  if (loadError) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-400">지도를 불러오지 못했어요.</div>;
  }
  if (!isLoaded) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-400">지도 로딩 중…</div>;
  }
  const center = stops[Math.floor(stops.length / 2)];
  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={{ lat: center.lat, lng: center.lng }}
      zoom={12}
      onLoad={(map) => {
        const bounds = new google.maps.LatLngBounds();
        stops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
        map.fitBounds(bounds, 40);
        nudgeGoogleMapResize(map, () => map.fitBounds(bounds, 40));
      }}
      options={{ disableDefaultUI: true, gestureHandling: "greedy" }}
    >
      <Polyline
        path={stops.map((s) => ({ lat: s.lat, lng: s.lng }))}
        options={{ strokeColor: "#4f46e5", strokeOpacity: 0.9, strokeWeight: 3 }}
      />
      {stops.map((s, i) => (
        <OverlayView key={i} position={{ lat: s.lat, lng: s.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
          <div className="flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-[11px] font-bold text-white shadow">
            {i + 1}
          </div>
        </OverlayView>
      ))}
    </GoogleMap>
  );
}
