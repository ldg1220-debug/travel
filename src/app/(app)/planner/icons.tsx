import { Trees, Ship } from "lucide-react";
import { CordixIcon, type CordixIconName } from "@/components/icons/CordixIcon";
import type { PlaceIcon } from "@/lib/types";

// Design-system icons for each place category (Place.icon is the shared
// string enum used by the whole app). Most categories map onto the Cordix
// icon set; `tree`/`boat` have no Cordix equivalent yet, so they stay on
// lucide-react until the design team adds park/harbor glyphs.
const CORDIX_ICONS: Partial<Record<PlaceIcon, CordixIconName>> = {
  coffee: "cafe",
  museum: "landmark",
  utensils: "restaurant",
  camera: "camera",
  pin: "pin",
};

export function PlaceGlyph({ icon, size, color }: { icon: PlaceIcon; size?: number; color?: string }) {
  const cordixName = CORDIX_ICONS[icon];
  if (cordixName) {
    return <CordixIcon name={cordixName} size={size} stroke={color} accent={color} />;
  }
  if (icon === "tree") return <Trees size={size} color={color} />;
  return <Ship size={size} color={color} />;
}
