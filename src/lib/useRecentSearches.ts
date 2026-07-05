"use client";

import { useCallback, useEffect, useState } from "react";
import type { DiscoverScope } from "@/lib/discoverData";

// v2: entries carry the scope they were searched under — replaying a
// recent search without its scope silently searched the wrong tab (e.g.
// "도톤보리 맛집" re-run while on 국내 → Kakao domestic search → nothing).
// The v1 key stored bare strings with no scope to migrate from, so v2
// simply starts fresh under a new key.
const STORAGE_KEY = "travel-discover-recent-searches-v2";
const MAX_RECENT = 5;

export interface RecentSearch {
  q: string;
  scope: DiscoverScope;
}

function isRecentSearch(x: unknown): x is RecentSearch {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.q === "string" && (r.scope === "domestic" || r.scope === "overseas");
}

function readStorage(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentSearch) : [];
  } catch {
    return [];
  }
}

/**
 * localStorage-backed recent search history for /discover's search box —
 * newest first, deduped by query text (re-searching something already in
 * the list bumps it to the front, adopting the newest scope), capped at
 * 5. Read lazily in an effect (not during the initial render) since
 * localStorage doesn't exist during SSR.
 */
export function useRecentSearches() {
  const [recent, setRecent] = useState<RecentSearch[]>([]);

  useEffect(() => {
    // genuinely syncing from an external system (localStorage, which
    // doesn't exist during SSR) — not state derivable during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readStorage());
  }, []);

  const addRecent = useCallback((query: string, scope: DiscoverScope) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecent((prev) => {
      const next = [{ q: trimmed, scope }, ...prev.filter((r) => r.q !== trimmed)].slice(0, MAX_RECENT);
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
