import type { Metadata } from "next";
import { PrivacyBody } from "./PrivacyBody";

/**
 * 개인정보처리방침 — 가입 시 필수 동의 대상 문서. 로그인 없이 볼 수 있는
 * 정적 페이지. 수집 항목·위탁처가 바뀌면(예: 새 외부 API, 결제 도입) 반드시
 * 함께 갱신할 것 (법률 전문가 최종 검토 전의 서비스 운영 초안).
 *
 * 본문은 PrivacyBody.tsx로 분리돼 있다 — ProfileSheet의 인앱 뷰어
 * (LegalDocSheet, 클라이언트 컴포넌트)가 그 본문을 가져다 쓰는데, 이
 * 파일에 서버 전용 `metadata` export가 같이 있으면 Next 빌드가 실패한다.
 */

// 작업지시서(2026-08-24, "아고다 반려 진단 + 제휴 심사 공통 요건") 4항 —
// 이전엔 layout.tsx의 기본값("Tradule 트레쥴")을 그대로 물려받아 모든
// 페이지 제목이 똑같았다.
export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "트레쥴(Tradule)의 개인정보 수집·이용·제3자 제공에 관한 안내입니다.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-8">
        <PrivacyBody />
      </div>
    </div>
  );
}
