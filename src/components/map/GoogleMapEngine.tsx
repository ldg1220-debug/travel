"use client";

import { GoogleMap, OverlayView, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { useMemo } from "react";
import { PlaceMarker } from "../PlaceMarker";
import { FallbackMapEngine, MapMessage } from "./FallbackMapEngine";
import type { MapEngineProps } from "./types";
import type { Place } from "@/lib/types";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export function GoogleMapEngine(props: MapEngineProps) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <FallbackMapEngine
        {...props}
        providerLabel="Demo map · set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
      />
    );
  }
  return <LiveGoogleMap {...props} />;
}

function centerOf(places: Place[]) {
  if (places.length === 0) return { lat: 35.0116, lng: 135.7681 }; // Kyoto
  const lat = places.reduce((sum, p) => sum + p.lat, 0) / places.length;
  const lng = places.reduce((sum, p) => sum + p.lng, 0) / places.length;
  return { lat, lng };
}

function LiveGoogleMap({ places, orderByPlace, routePoints, interactive, onShortPress }: MapEngineProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "travel-scheduler-google-map",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });
  const mapCenter = useMemo(() => centerOf(places), [places]);

  if (loadError) return <MapMessage text="Failed to load Google Maps." />;
  if (!isLoaded) return <MapMessage text="Loading map…" />;

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={mapCenter}
      zoom={14}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: interactive ? "greedy" : "none",
        draggable: interactive,
      }}
    >
      {routePoints.length >= 2 && (
        <Polyline
          path={routePoints}
          options={{
            strokeColor: "#111827",
            strokeOpacity: 0.75,
            strokeWeight: 3,
            icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1 }, offset: "0", repeat: "12px" }],
          }}
        />
      )}
      {places.map((place) => (
        <OverlayView
          key={place.id}
          position={{ lat: place.lat, lng: place.lng }}
          mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        >
          <PlaceMarker
            place={place}
            order={orderByPlace[place.id]}
            style={{ left: 0, top: 0 }}
            onShortPress={onShortPress}
          />
        </OverlayView>
      ))}
    </GoogleMap>
  );
}
