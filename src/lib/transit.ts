import { haversineDistanceMeters } from "./geo";

export type TransitMode = "walk" | "transit";

export interface TransitEstimate {
  mode: TransitMode;
  minutes: number;
  distanceMeters: number;
}

/** A place-to-place gap in a day's schedule, keyed to the empty hour slot it renders in. */
export interface TransitBlock extends TransitEstimate {
  /** Hour slot (in TIMELINE_HOURS) this block occupies — the first empty hour after `fromId`. */
  hour: number;
  fromId: string;
  toId: string;
}

const WALK_SPEED_MPS = 1.25; // ~4.5km/h average walking pace
const TRANSIT_SPEED_MPS = 8.3; // ~30km/h average bus/subway including stops
const TRANSIT_OVERHEAD_MINUTES = 8; // waiting + transfer buffer
const WALK_DISTANCE_THRESHOLD_METERS = 1200; // beyond this, prefer transit over walking

/**
 * Offline fallback used for every transit estimate in this app: no Distance
 * Matrix key is configured in this sandbox, so travel time is derived from
 * the straight-line (Haversine) distance at a flat average speed per mode
 * instead of being left blank or blocking the timeline on a network call.
 */
export function estimateTransit(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): TransitEstimate {
  const distanceMeters = haversineDistanceMeters(a, b);
  if (distanceMeters <= WALK_DISTANCE_THRESHOLD_METERS) {
    return {
      mode: "walk",
      minutes: Math.max(1, Math.round(distanceMeters / WALK_SPEED_MPS / 60)),
      distanceMeters,
    };
  }
  return {
    mode: "transit",
    minutes: Math.round(distanceMeters / TRANSIT_SPEED_MPS / 60) + TRANSIT_OVERHEAD_MINUTES,
    distanceMeters,
  };
}

/**
 * Real Distance Matrix lookup, gated on the Maps JS SDK actually being
 * loaded (i.e. a live NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) — not wired into any
 * render path here since this sandbox has no key to test it against. If
 * enabled later, treat it as an *upgrade* over estimateTransit()'s
 * synchronous result rather than a replacement for it: the timeline must
 * never block on a network round trip just to paint.
 *
 *   const service = new google.maps.DistanceMatrixService();
 *   const res = await service.getDistanceMatrix({
 *     origins: [a],
 *     destinations: [b],
 *     travelMode: google.maps.TravelMode.TRANSIT,
 *   });
 *   const el = res.rows[0]?.elements[0];
 *   if (el?.status === "OK") return { mode: "transit", minutes: Math.round(el.duration!.value / 60), distanceMeters: el.distance!.value };
 */
export async function estimateTransitViaGoogle(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): Promise<TransitEstimate | null> {
  if (typeof window === "undefined" || !window.google?.maps?.DistanceMatrixService) return null;
  try {
    const service = new window.google.maps.DistanceMatrixService();
    const res = await service.getDistanceMatrix({
      origins: [a],
      destinations: [b],
      travelMode: window.google.maps.TravelMode.TRANSIT,
    });
    const el = res.rows[0]?.elements[0];
    if (!el || el.status !== "OK" || !el.duration || !el.distance) return null;
    return { mode: "transit", minutes: Math.round(el.duration.value / 60), distanceMeters: el.distance.value };
  } catch {
    return null;
  }
}

/**
 * Derives one transit block per consecutive pair of scheduled stops that
 * has at least one free hour between them — placed in the first free hour
 * after the earlier stop. Pairs with no gap (back-to-back hour slots) have
 * nowhere to render a block, since every hour is already spoken for.
 */
export function calculateTransits(
  scheduleItems: { id: string; time: string; coordinates: { lat: number; lng: number } }[],
  hourFromTime: (time: string) => number,
): TransitBlock[] {
  const blocks: TransitBlock[] = [];
  for (let i = 0; i < scheduleItems.length - 1; i++) {
    const from = scheduleItems[i];
    const to = scheduleItems[i + 1];
    const fromHour = hourFromTime(from.time);
    const toHour = hourFromTime(to.time);
    if (toHour <= fromHour + 1) continue; // no free hour to render into
    blocks.push({ hour: fromHour + 1, fromId: from.id, toId: to.id, ...estimateTransit(from.coordinates, to.coordinates) });
  }
  return blocks;
}
