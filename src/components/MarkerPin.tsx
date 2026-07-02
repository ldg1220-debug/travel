import { Icon } from "./Icon";
import type { Place } from "@/lib/types";

interface MarkerPinProps {
  place: Place;
  order?: number;
  pressing?: boolean;
}

/** Teardrop pin visual shared by the map marker and the drag overlay ghost. */
export function MarkerPin({ place, order, pressing }: MarkerPinProps) {
  return (
    <div
      className="marker-pop relative"
      style={{
        transform: pressing ? "scale(1.12)" : "scale(1)",
        transition: "transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      {pressing && (
        <div
          className="lp-ring absolute rounded-full"
          style={{
            left: "50%",
            top: 14,
            transform: "translate(-50%, -50%)",
            width: 36,
            height: 36,
            border: `2px solid ${place.color}`,
            opacity: 0.9,
          }}
        />
      )}
      <svg width="40" height="52" viewBox="0 0 40 52">
        <defs>
          <linearGradient id={`g-${place.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={place.color} stopOpacity="1" />
            <stop offset="100%" stopColor={place.color} stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <path
          d="M20 2c9.9 0 18 7.8 18 17.5 0 12.6-14.7 26-16.7 27.7a2 2 0 0 1-2.6 0C16.7 45.5 2 32.1 2 19.5 2 9.8 10.1 2 20 2z"
          fill={`url(#g-${place.id})`}
          stroke="white"
          strokeWidth="2.5"
        />
        <circle cx="20" cy="19" r="11" fill="white" opacity="0.95" />
      </svg>
      <div
        className="absolute"
        style={{ left: "50%", top: 9, transform: "translateX(-50%)" }}
      >
        <Icon name={place.icon} size={16} color={place.color} />
      </div>
      {order != null && (
        <div
          className="absolute rounded-full flex items-center justify-center text-white tabular"
          style={{
            right: -6,
            top: -6,
            width: 20,
            height: 20,
            background: "#111827",
            fontSize: 11,
            fontWeight: 700,
            border: "2px solid white",
          }}
        >
          {order}
        </div>
      )}
    </div>
  );
}
