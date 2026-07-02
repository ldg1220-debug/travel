"use client";

import { signIn } from "next-auth/react";
import { Icon } from "./Icon";

interface LoginModalProps {
  onClose: () => void;
  reason?: string;
}

const PROVIDERS = [
  { id: "google", label: "Google로 계속하기", bg: "#ffffff", color: "#1f2937", border: "#e5e7eb" },
  { id: "kakao", label: "카카오로 계속하기", bg: "#FEE500", color: "#191600", border: "#FEE500" },
  { id: "apple", label: "Apple로 계속하기", bg: "#111827", color: "#ffffff", border: "#111827" },
];

/**
 * Shown at the moment of [저장]/[공유], not on load — browsing the trend
 * list and drag-and-drop planning both work fully signed-out.
 */
export function LoginModal({ onClose, reason }: LoginModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[340px] bg-white rounded-3xl shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
          aria-label="Close"
        >
          <Icon name="x" size={14} color="#64748b" />
        </button>

        <div className="text-[17px] font-semibold text-slate-900">로그인이 필요해요</div>
        <p className="text-[13px] text-slate-500 mt-1">
          {reason ?? "일정을 저장하거나 공유하려면 로그인해주세요."}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => signIn(p.id)}
              className="w-full py-3 rounded-2xl text-[14px] font-semibold border transition-transform active:scale-[0.98]"
              style={{ background: p.bg, color: p.color, borderColor: p.border }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
