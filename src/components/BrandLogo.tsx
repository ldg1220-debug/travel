"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Brand asset slots (public/brand/). Every image renders with a graceful
 * fallback, so a missing file never shows a broken icon — drop the asset in
 * and it lights up with no code change.
 *
 * Two forms:
 *  - "full":     the graffiti emblem (compass + lettering + drips) — for
 *                roomy surfaces: splash, login, empty states.
 *  - "wordmark": lettering-only — for compact top bars / headers. Until the
 *                cropped wordmark images are added, a styled text wordmark
 *                (bold graffiti-ish italic) renders instead.
 */
const LOGO_SRC: Record<"full" | "wordmark", Record<"dark" | "light" | "neon", string>> = {
  full: {
    dark: "/brand/tradule-logo.png",
    light: "/brand/tradule-logo-white.png",
    neon: "/brand/tradule-logo-cyan.png",
  },
  wordmark: {
    dark: "/brand/tradule-wordmark.png",
    light: "/brand/tradule-wordmark-white.png",
    neon: "/brand/tradule-wordmark-cyan.png",
  },
};

export function BrandLogo({
  fallback,
  imgClassName,
  alt = "Tradule 트레쥴",
  variant = "dark",
  form = "full",
}: {
  fallback: React.ReactNode;
  imgClassName?: string;
  alt?: string;
  /** "dark" = black line-art (light backgrounds, default); "light" = white; "neon" = cyan (dark backgrounds). */
  variant?: "dark" | "light" | "neon";
  /** "full" = graffiti emblem; "wordmark" = lettering only (compact headers). */
  form?: "full" | "wordmark";
}) {
  // Render the logo eagerly so it paints as soon as it decodes (important for
  // the ~1.3s splash — a hidden/deferred image wouldn't load in time). If the
  // asset is missing, onError swaps in the fallback. A missing file can also
  // error *before* React hydrates (so onError never fires) — the mount effect
  // re-checks naturalWidth to catch that race.
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const img = ref.current;
      if (img && img.complete && img.naturalWidth === 0) setFailed(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset with an onError fallback; next/image can't express the "show text if the file is absent" degrade path.
    <img
      ref={ref}
      src={LOGO_SRC[form][variant]}
      alt={alt}
      loading="eager"
      fetchPriority="high"
      onError={() => setFailed(true)}
      className={imgClassName}
    />
  );
}

/** Styled text wordmark — graffiti-flavored bold italic "Tradule" + thin 트레쥴. `neon` renders cyan with a glow for dark backgrounds. */
export function WordmarkText({ neon = false, className = "" }: { neon?: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 whitespace-nowrap font-extrabold italic tracking-tight ${
        neon ? "text-cyan-300 [text-shadow:0_0_10px_rgba(34,211,238,0.55)]" : "text-slate-900"
      } ${className}`}
    >
      Tradule
      <span className={`not-italic text-[0.55em] font-light tracking-normal ${neon ? "text-cyan-200/80" : "text-slate-400"}`}>
        트레쥴
      </span>
    </span>
  );
}

/**
 * Brand mark wrapper. The current logo is a full-color gradient mark (not a
 * monochrome line-art), so it reads cleanly on both light and dark
 * backgrounds without swapping images or adding a glow filter — this used to
 * toggle between a black/cyan-neon pair for the old graffiti line-art logo,
 * but applying that neon drop-shadow to today's colorful PNG just smeared a
 * visible halo around the letters, especially in dark mode. Kept as its own
 * component (rather than inlining BrandLogo everywhere) so a future themed
 * variant can slot back in without touching every call site.
 */
export function ThemedLogo({
  imgClassName = "",
  form = "full",
  textClassName = "",
}: {
  imgClassName?: string;
  form?: "full" | "wordmark";
  /** Sizing for the text-wordmark fallback (e.g. "text-xl") — only relevant while the wordmark images are absent. */
  textClassName?: string;
}) {
  return <BrandLogo form={form} imgClassName={imgClassName} fallback={<WordmarkText className={textClassName} />} />;
}
