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
  // Show the fallback by default and only reveal the image once it *loads*, so
  // a missing/404 asset never flashes a broken-image icon. onError drops the
  // <img> entirely, leaving the fallback in place.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      {!loaded && fallback}
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element -- static brand asset with a load/error fallback; next/image can't express the "show text until this file loads" degrade path.
        <img
          src="/brand/tradule-logo.png"
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={imgClassName}
          style={loaded ? undefined : { display: "none" }}
        />
      )}
    </>
  );
}
