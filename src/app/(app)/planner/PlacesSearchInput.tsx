"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import type { Place, Region } from "@/lib/types";

const DEBOUNCE_MS = 400;

interface PlacesSearchInputProps {
  region: Region;
  onSelect: (place: Place) => void;
}

/**
 * The map's quick "장소 검색" box — routes through the same `/api/places/search`
 * endpoint (Google Places / Kakao Local + landmark-radius "X 근처 Y" parsing)
 * that 여행 계획짜기(discover)'s search uses, instead of Google's raw
 * Autocomplete Suggestion API. Autocomplete only ever prefix-matches a real
 * place's own name, so "카이유칸 근처 맛집" returned nothing — this box now
 * behaves identically to discover's search for that kind of query.
 */
export function PlacesSearchInput({ region, onSelect }: PlacesSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const trimmedQuery = query.trim();
  const visibleResults = trimmedQuery ? results : [];
  const showLoading = loading && trimmedQuery.length > 0;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!trimmedQuery) return;

    const thisRequestId = ++requestIdRef.current;

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/api/places/search?region=${region}&q=${encodeURIComponent(trimmedQuery)}`;
        const res = await fetch(url);
        const data = (await res.json()) as { places?: Place[] };
        if (requestIdRef.current === thisRequestId) setResults(data.places ?? []);
      } catch {
        if (requestIdRef.current === thisRequestId) setResults([]);
      } finally {
        if (requestIdRef.current === thisRequestId) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmedQuery, region]);

  const handleSelect = (place: Place) => {
    onSelect(place);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <Search size={14} className="shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="장소 검색… (예: 카이유칸 근처 맛집)"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
        />
        {showLoading && <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" />}
      </div>

      {open && visibleResults.length > 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {visibleResults.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className="flex w-full items-center gap-2 truncate px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.rating != null && (
                <span className="shrink-0 text-[11px] tabular-nums text-slate-400">★{p.rating.toFixed(1)}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && !showLoading && trimmedQuery && visibleResults.length === 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] text-slate-400 shadow-lg">
          검색 결과가 없어요.
        </div>
      )}
    </div>
  );
}
