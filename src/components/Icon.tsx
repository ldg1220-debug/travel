import type { PlaceIcon } from "@/lib/types";

type IconName = PlaceIcon | "clock" | "x" | "plus" | "chevronLeft" | "chevronRight";

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 14, color = "white" }: IconProps) {
  const s = size;
  const stroke = {
    stroke: color,
    strokeWidth: 1.8,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "coffee":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
          <path d="M16 9h2a3 3 0 0 1 0 6h-2" />
          <path d="M7 3v2M10 3v2M13 3v2" />
        </svg>
      );
    case "museum":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M3 10 12 4l9 6" />
          <path d="M5 10v9M19 10v9M9 10v9M15 10v9M3 20h18" />
        </svg>
      );
    case "tree":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M12 3c3 2 5 5 5 8a5 5 0 0 1-10 0c0-3 2-6 5-8z" />
          <path d="M12 14v7" />
        </svg>
      );
    case "boat":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M3 15h18l-2 4H5l-2-4z" />
          <path d="M5 15V9l7-4 7 4v6" />
          <path d="M12 5v10" />
        </svg>
      );
    case "utensils":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11" />
          <path d="M17 3c-1.5 0-3 1.5-3 4s1.5 4 3 4v10" />
        </svg>
      );
    case "camera":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13.5" r="3.5" />
        </svg>
      );
    case "pin":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case "clock":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "x":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M6 6l12 12M18 6l-12 12" />
        </svg>
      );
    case "plus":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "chevronLeft":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      );
    case "chevronRight":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    default:
      return null;
  }
}
