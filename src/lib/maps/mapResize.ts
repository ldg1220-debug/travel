/**
 * The Google Maps JS SDK measures its container's size exactly once, when
 * the map is constructed, and never re-checks it on its own (no internal
 * ResizeObserver). If the container's real layout hasn't settled yet at
 * that exact moment — a percentage-height flex column that resolves one
 * frame late, a modal still mid-animation-in, a Suspense/hydration handoff
 * — the map can be left permanently rendered at 0x0: a blank/gray box with
 * no console error, since nothing actually failed, the SDK just measured
 * too early. This is far more likely to bite on a fresh production
 * deploy (different hydration/paint timing than a local dev server) than
 * locally, which matches "works on localhost, blank on Vercel, no errors."
 *
 * The fix is to force a re-measure once layout has actually settled: fire
 * the SDK's own `resize` event (which makes it re-read the container and
 * repaint), then re-apply whatever centering/fitting the caller wanted.
 * Done via a double rAF (past the current paint) with a short setTimeout
 * fallback for slower cold-start layouts — both calls are idempotent, so
 * firing twice is harmless.
 */
export function nudgeGoogleMapResize(map: google.maps.Map, after?: () => void): void {
  const fire = () => {
    google.maps.event.trigger(map, "resize");
    after?.();
  };
  requestAnimationFrame(() => requestAnimationFrame(fire));
  setTimeout(fire, 250);
}
