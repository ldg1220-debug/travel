import { Coffee, Landmark, Trees, Ship, Utensils, Camera, MapPin, type LucideIcon } from "lucide-react";
import type { PlaceIcon } from "@/lib/types";

// Design-system icons for each place category (Place.icon is the shared
// string enum used by the whole app; the shadcn/lucide prototype UI wants
// real components, so this is the only translation layer needed).
export const ICONS: Record<PlaceIcon, LucideIcon> = {
  coffee: Coffee,
  museum: Landmark,
  tree: Trees,
  boat: Ship,
  utensils: Utensils,
  camera: Camera,
  pin: MapPin,
};

export function PlaceGlyph({ icon, size, color }: { icon: PlaceIcon; size?: number; color?: string }) {
  const Icon = ICONS[icon];
  return <Icon size={size} color={color} />;
}
