import type { Place } from "@/lib/types";

export interface MapEngineProps {
  places: Place[];
  orderByPlace: Record<string, number>;
  routePoints: { lat: number; lng: number }[];
  interactive: boolean;
  onShortPress: (place: Place) => void;
}
