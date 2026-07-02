"use client";

import type { Region } from "@/lib/types";

interface RegionTabsProps {
  region: Region;
  onChange: (region: Region) => void;
}

const TABS: { region: Region; label: string }[] = [
  { region: "domestic", label: "🇰🇷 국내" },
  { region: "international", label: "✈️ 해외" },
];

export function RegionTabs({ region, onChange }: RegionTabsProps) {
  return (
    <div className="flex gap-1 p-1 mx-4 mt-3 rounded-full bg-slate-100 shrink-0">
      {TABS.map((tab) => {
        const active = tab.region === region;
        return (
          <button
            key={tab.region}
            onClick={() => onChange(tab.region)}
            className="flex-1 py-1.5 rounded-full text-[13px] font-semibold transition-all"
            style={{
              background: active ? "#111827" : "transparent",
              color: active ? "white" : "#64748b",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
