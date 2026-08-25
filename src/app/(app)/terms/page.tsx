import type { Metadata } from "next";
import { TermsBody } from "./TermsBody";

/**
 * 이용약관 — 가입 시 필수 동의 대상 문서. 로그인 없이 볼 수 있는 정적
 * 페이지. 문안을 바꾸면 시행일자를 함께 갱신할 것 (법률 전문가 최종 검토
 * 전의 서비스 운영 초안).
 *
 * 본문은 TermsBody.tsx로 분리돼 있다 — PrivacyBody.tsx와 같은 이유
 * (ProfileSheet의 인앱 뷰어가 쓰는 클라이언트 번들에 서버 전용
 * `metadata` export가 섞이는 걸 피하기 위함).
 */

// 작업지시서(2026-08-24, "아고다 반려 진단 + 제휴 심사 공통 요건") 4항.
export const metadata: Metadata = {
  title: "이용약관",
  description: "트레쥴(Tradule) 서비스 이용약관입니다.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-8">
        <TermsBody />
      </div>
    </div>
  );
}
