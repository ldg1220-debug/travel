"use client";

import { useEffect, useRef } from "react";

/**
 * Makes the Android/browser back button close an open overlay instead of
 * navigating away from the whole page. Overlays like PlaceDetailOverlay
 * open via local state (no route change), so without this there's no
 * history entry for back to land on — one back-press skips past the
 * overlay AND the page underneath it (e.g. search results), landing
 * wherever the user was before that, which reads as "back kicked me all
 * the way to the home screen."
 */
export function useBackButtonClose(isOpen: boolean, onClose: () => void) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    history.pushState({ overlay: true }, "");
    pushedRef.current = true;

    const handlePopState = () => {
      pushedRef.current = false;
      onClose();
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Closed some other way (X button, picking a place, etc.) while our
      // pushed entry is still on top — consume it with a programmatic back
      // so a second back-press isn't needed to actually leave the page.
      if (pushedRef.current) {
        pushedRef.current = false;
        history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the open/close transition should re-run this, not onClose identity churn
  }, [isOpen]);
}
