"use client";

import { X } from "lucide-react";
import { TermsBody } from "@/app/(app)/terms/page";
import { PrivacyBody } from "@/app/(app)/privacy/page";

/**
 * 이용약관/개인정보처리방침을 앱 안에서 바로 보여주는 뷰어 — 가입 동의
 * 체크박스가 `target="_blank"` 링크였을 때 새 탭이 뜨지 않는다는 신고가
 * 있어(모바일 브라우저·PWA 환경에 따라 새 탭 열기가 막히거나 눈에 안 띌 수
 * 있음), 새 창을 띄우는 대신 같은 화면 위에 겹쳐서 보여주는 방식으로 바꿨다.
 */
export function LegalDocSheet({ doc, onClose }: { doc: "terms" | "privacy"; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl dark:bg-slate-900">
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <X size={16} />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-8 text-slate-900 dark:text-slate-100">
          {doc === "terms" ? <TermsBody /> : <PrivacyBody />}
        </div>
      </div>
    </div>
  );
}
