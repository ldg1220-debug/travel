"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/**
 * Light/dark toggle. Applies immediately by toggling the `.dark` class on
 * <html> (which flips the CSS-var theme + every `dark:` utility) and persists
 * the choice to localStorage. The no-flash init script in the root layout sets
 * the initial class before paint, so this component just mirrors/updates it.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Sync initial icon from the class the no-flash script already applied
  // (deferred to a callback so it isn't a synchronous setState in the effect body).
  useEffect(() => {
    const t = setTimeout(() => setDark(document.documentElement.classList.contains("dark")), 0);
    return () => clearTimeout(t);
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    // 브라우저 강제 다크(웹사이트 어둡게)용 신호도 함께 갱신 — 라이트일 땐
    // "only light"로 옵트아웃, 다크일 땐 페이지가 직접 다크임을 알린다.
    document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", next ? "dark" : "only light");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={dark ? "라이트 모드" : "다크 모드"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
