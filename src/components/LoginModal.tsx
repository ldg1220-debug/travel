"use client";

import { signIn } from "next-auth/react";
import { Icon } from "./Icon";
import { BrandLogo } from "./BrandLogo";

interface LoginModalProps {
  onClose: () => void;
  /** Contextual reason the sheet appeared (e.g. "일정을 공유하려면 로그인해주세요."). Undefined = opened proactively, so a welcoming default is shown. */
  reason?: string;
}

/** Brand-mark logos so each button reads as the provider at a glance, not just text. */
function GoogleGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.9 36.7 44 31 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
function KakaoGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="#191600">
      <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.7-.8 3.1-.1.5.2.5.4.4.2-.1 2.7-1.8 3.8-2.6.6.1 1.3.2 1.9.2 5.5 0 10-3.6 10-8s-4.5-8-10-8z" />
    </svg>
  );
}
function AppleGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden fill="#ffffff">
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.9-1.4-.1-2.8.8-3.5.8-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.4 1.2-.1 1.6-.8 3.1-.8s1.8.8 3.1.8c1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.5-1-2.5-3.7zM14.1 6c.7-.8 1.1-2 1-3.1-1 .1-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.8-1.3z" />
    </svg>
  );
}

const PROVIDERS = [
  { id: "google", label: "Google로 계속하기", bg: "#ffffff", color: "#1f2937", border: "#e5e7eb", glyph: <GoogleGlyph /> },
  { id: "kakao", label: "카카오로 계속하기", bg: "#FEE500", color: "#191600", border: "#FEE500", glyph: <KakaoGlyph /> },
  { id: "apple", label: "Apple로 계속하기", bg: "#111827", color: "#ffffff", border: "#111827", glyph: <AppleGlyph /> },
];

/**
 * Shown at the moment of [저장]/[공유], or opened proactively from the drawer
 * — browsing the trend list and drag-and-drop planning both work fully
 * signed-out, so this is never a hard gate on load.
 */
export function LoginModal({ onClose, reason }: LoginModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[360px] overflow-hidden rounded-3xl bg-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100/80 backdrop-blur transition-colors hover:bg-slate-200"
          aria-label="닫기"
        >
          <Icon name="x" size={14} color="#64748b" />
        </button>

        <div className="px-7 pb-7 pt-9">
          {/* ── brand ── */}
          <div className="flex flex-col items-center text-center">
            <BrandLogo
              imgClassName="h-16 w-auto"
              fallback={
                <>
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-[26px] shadow-lg shadow-indigo-200">
                    ✈️
                  </span>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-xl font-bold tracking-tight text-slate-900">Tradule</span>
                    <span className="text-[12px] font-medium text-slate-400">트레쥴</span>
                  </div>
                </>
              }
            />
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
              {reason ?? "로그인하면 일정을 저장하고 어디서든 이어볼 수 있어요."}
            </p>
          </div>

          {/* ── providers ── */}
          <div className="mt-6 flex flex-col gap-2.5">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => signIn(p.id)}
                className="flex w-full items-center justify-center gap-2.5 rounded-2xl border py-3 text-[14px] font-semibold shadow-sm transition-transform active:scale-[0.98]"
                style={{ background: p.bg, color: p.color, borderColor: p.border }}
              >
                {p.glyph}
                {p.label}
              </button>
            ))}
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
            계속하면 <span className="underline underline-offset-2">이용약관</span> 및{" "}
            <span className="underline underline-offset-2">개인정보처리방침</span>에 동의하게 됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
