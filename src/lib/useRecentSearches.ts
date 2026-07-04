"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "travel-discover-recent-searches";
const MAX_RECENT = 5;

function readStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * localStorage-backed recent search history for /discover's search box —
 * newest first, deduped (re-searching something already in the list bumps
 * it back to the front instead of duplicating it), capped at 5. Read
 * lazily in an effect (not during the initial render) since localStorage
 * doesn't exist during SSR.
 */
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    // genuinely syncing from an external system (localStorage, which
    // doesn't exist during SSR) — not state derivable during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readStorage());
  }, []);

  const addRecent = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, MAX_RECENT);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage can be unavailable (private mode, quota) — recent
        // searches just won't persist, not worth surfacing an error for.
      }
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecent([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // see addRecent
    }
  }, []);

  return { recent, addRecent, clearRecent };
}
