"use client";

import { useState } from "react";

/**
 * Renders the Tradule brand logo image from /brand/tradule-logo.png when it
 * exists, and gracefully falls back to whatever `fallback` node you pass
 * (usually the text wordmark) if the file is missing or fails to load. This
 * lets us wire the logo into the drawer / splash / login *now* and have it
 * light up the moment the asset is dropped into public/brand/, without ever
 * showing a broken image in the meantime.
 */
export function BrandLogo({
  fallback,
  imgClassName,
  alt = "Tradule 트레쥴",
}: {
  fallback: React.ReactNode;
  imgClassName?: string;
  alt?: string;
}) {
  // Render the logo eagerly so it paints as soon as it decodes (important for
  // the ~1.3s splash — a hidden/deferred image wouldn't load in time). If the
  // asset is missing, onError swaps in the fallback (text/✈️ mark).
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset with an onError fallback; next/image can't express the "show text if the file is absent" degrade path.
    <img
      src="/brand/tradule-logo.png"
      alt={alt}
      loading="eager"
      fetchPriority="high"
      onError={() => setFailed(true)}
      className={imgClassName}
    />
  );
}
