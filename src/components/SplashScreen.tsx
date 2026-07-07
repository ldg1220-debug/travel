"use client";

import { useEffect, useState } from "react";
import { ThemedLogo } from "./BrandLogo";

const SESSION_KEY = "tradule_splash_shown";

/**
 * App-start waiting screen. Shown once per browser session (sessionStorage
 * flag) so it appears on a cold open but not on every in-app navigation,
 * then fades out. Purely presentational — it never blocks interaction (it's
 * an overlay that removes itself), so a slow network can't trap the user
 * behind it. Falls back to the ✈️ brand mark until the real logo asset is
 * added at public/brand/tradule-logo.png.
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Already shown this session → dismiss on the next tick (a callback, not a
    // synchronous setState in the effect body) so in-app navigation doesn't
    // re-flash the splash.
    if (sessionStorage.getItem(SESSION_KEY)) {
      const skip = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(skip);
    }
    const fadeAt = setTimeout(() => setFading(true), 850);
    const hideAt = setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem(SESSION_KEY, "1");
    }, 1300);
    return () => {
      clearTimeout(fadeAt);
      clearTimeout(hideAt);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white transition-opacity duration-500 dark:bg-slate-950 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden
    >
      <div className="flex flex-col items-center gap-4">
        {/* full graffiti emblem, sized up — black in light mode, cyan neon in dark mode */}
        <ThemedLogo imgClassName="h-56 w-auto animate-[fadeInUp_0.5s_ease-out]" />
        {/* subtle loading dots */}
        <div className="mt-2 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-indigo-400"
              style={{ animation: `splashPulse 1s ${i * 0.15}s ease-in-out infinite` }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes splashPulse { 0%,100%{opacity:.25;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
