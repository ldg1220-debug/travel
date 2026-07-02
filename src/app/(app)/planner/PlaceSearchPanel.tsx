"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { PlaceGlyph } from "./icons";
import type { Place, Region } from "@/lib/types";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "attraction", label: "관광명소" },
  { value: "lodging", label: "숙소" },
  { value: "restaurant", label: "음식점" },
];

interface PlaceSearchPanelProps {
  region: Region;
  onRegionChange: (region: Region) => void;
  /** A result row was tapped — the caller opens the 딥 다이브 overlay with it. */
  onSelect: (place: Place) => void;
}

/**
 * 관심 장소 tab's search — the real `/api/places/search` route (Google
 * Places / Kakao Local + category → includedTypes + empty-result
 * fall-back), replacing the old `/dev/search-test` QA page now that this
 * is the actual product surface. Region/category are picked explicitly
 * (no autocomplete-as-you-type) so results render as a reviewable list,
 * matching the "탭해서 상세 오버레이" flow this tab already uses.
 */
export function PlaceSearchPanel({ region, onRegionChange, onSelect }: PlaceSearchPanelProps) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setStatus("loading");
    setErrorMessage("");
    try {
      const url = `/api/places/search?region=${region}&category=${category}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API responded with ${res.status}`);
      const data = (await res.json()) as { places: Place[] };
      setPlaces(data.places);
      setStatus("idle");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "검색에 실패했어요");
      setStatus("error");
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onRegionChange("domestic")}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            region === "domestic" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          국내
        </button>
        <button
          type="button"
          onClick={() => onRegionChange("international")}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            region === "international" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          해외
        </button>
        <span className="mx-0.5 w-px shrink-0 bg-slate-200" />
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              category === c.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <Search size={14} className="shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="장소 이름을 검색해보세요"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
        />
        {status === "loading" && <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" />}
      </div>

      {status === "error" && <p className="text-[12px] text-red-600">에러: {errorMessage}</p>}

      {places !== null && status !== "loading" && (
        <div className="space-y-2">
          {places.length === 0 ? (
            <p className="text-center text-[12px] text-slate-400">검색 결과가 없어요.</p>
          ) : (
            places.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: p.color }}
                >
                  <PlaceGlyph icon={p.icon} size={14} color="white" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-900">{p.name}</p>
                  <p className="truncate text-[10.5px] text-slate-500">{p.address ?? p.category}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
