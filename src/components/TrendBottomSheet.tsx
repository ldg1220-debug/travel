"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "./Icon";
import { searchPlaces } from "@/lib/api";
import type { Place, Region } from "@/lib/types";

interface TrendBottomSheetProps {
  open: boolean;
  onClose: () => void;
  region: Region;
  trendingPlaces: Place[];
  onSelectPlace: (place: Place) => void;
}

/** Bottom sheet for browsing the curated trend list and searching places. */
export function TrendBottomSheet({ open, onClose, region, trendingPlaces, onSelectPlace }: TrendBottomSheetProps) {
  const [query, setQuery] = useState("");

  const close = () => {
    setQuery("");
    onClose();
  };

  const { data: searchResults = [], isFetching } = useQuery({
    queryKey: ["place-search", region, query],
    queryFn: () => searchPlaces(region, query),
    enabled: query.trim().length > 0,
  });

  const list = query.trim() ? searchResults : trendingPlaces;

  return (
    <>
      <div
        className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 z-30 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
      />
      <div
        className={`absolute left-0 right-0 bottom-0 z-40 bg-white rounded-t-3xl shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ height: "72%" }}
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2 shrink-0">
          <div className="text-[15px] font-semibold text-slate-900">✨ Trending spots</div>
          <button
            onClick={close}
            className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center"
            aria-label="Close"
          >
            <Icon name="x" size={12} color="#64748b" />
          </button>
        </div>
        <div className="px-5 pb-3 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={region === "domestic" ? "지역, 장소 검색" : "Search places"}
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            />
            {isFetching && <span className="text-[10px] text-slate-400">…</span>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
          {list.length === 0 ? (
            <div className="text-center text-[12px] text-slate-400 py-10">No places found</div>
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((place) => (
                <button
                  key={place.id}
                  onClick={() => {
                    onSelectPlace(place);
                    close();
                  }}
                  className="flex items-center gap-3 p-2.5 rounded-2xl border border-slate-100 hover:bg-slate-50 text-left"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: place.color }}
                  >
                    <Icon name={place.icon} size={18} color="white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-slate-900 truncate">{place.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {place.category}
                      {place.rating != null ? ` · ★ ${place.rating.toFixed(1)}` : ""}
                    </div>
                  </div>
                  <Icon name="plus" size={14} color="#94a3b8" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
