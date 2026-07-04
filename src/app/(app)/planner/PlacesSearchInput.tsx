"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { useGoogleMapsStatus } from "./MapProvider";
import { placeFromGoogleDetails } from "@/lib/placeAdapters";
import type { Place } from "@/lib/types";

const DEBOUNCE_MS = 400;
// Roughly between Fukuoka and Yufuin, so predictions bias toward this trip.
const BIAS_CENTER = { lat: 33.45, lng: 130.9 };

interface PlacesSearchInputProps {
  onSelect: (place: Place) => void;
}

/**
 * Google Places Autocomplete (New), cost-controlled per Google's guidance:
 *  - one AutocompleteSessionToken reused across every keystroke of a
 *    search, discarded once a place is selected (or the input is cleared)
 *  - the actual prediction fetch is debounced ~400ms so typing doesn't
 *    fire a request per character
 *  - Place.fetchFields() on selection is restricted to exactly the fields
 *    this app renders (name/geometry/id/category) instead of "ALL"
 */
export function PlacesSearchInput({ onSelect }: PlacesSearchInputProps) {
  const { isLoaded } = useGoogleMapsStatus();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const trimmedQuery = query.trim();
  // Derived at render time rather than reset via effect+setState on the
  // empty-query path — nothing to synchronize with an external system there.
  const visibleSuggestions = trimmedQuery ? suggestions : [];
  const showLoading = loading && trimmedQuery.length > 0;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isLoaded || !trimmedQuery) return;

    const thisRequestId = ++requestIdRef.current;

    debounceRef.current = setTimeout(async () => {
      // Only flip the spinner on once the debounce window elapses and a
      // request is actually about to go out, not while still typing.
      setLoading(true);
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      }
      try {
        const { suggestions: results } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmedQuery,
          sessionToken: sessionTokenRef.current,
          locationBias: { ...BIAS_CENTER, radius: 60000 },
        });
        if (requestIdRef.current === thisRequestId) setSuggestions(results);
      } catch {
        if (requestIdRef.current === thisRequestId) setSuggestions([]);
      } finally {
        if (requestIdRef.current === thisRequestId) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmedQuery, isLoaded]);

  const handleSelect = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;

    const place = prediction.toPlace();
    // Minimal field mask — keeps this call (and the whole autocomplete
    // session it closes out) as cheap as possible.
    await place.fetchFields({ fields: ["displayName", "location", "id", "types"] });

    onSelect(placeFromGoogleDetails(place));

    setQuery("");
    setSuggestions([]);
    setOpen(false);
    sessionTokenRef.current = null; // session ends once a place is chosen
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
          placeholder={isLoaded ? "장소 검색…" : "검색 준비 중…"}
          disabled={!isLoaded}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
        />
        {showLoading && <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" />}
      </div>

      {open && visibleSuggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {visibleSuggestions.map((s) => (
            <button
              key={s.placePrediction?.placeId}
              onClick={() => handleSelect(s)}
              className="block w-full truncate px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"
            >
              {s.placePrediction?.text.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
