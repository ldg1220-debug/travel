import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** User-chosen public display name, set during profile setup. Null until then — gates the mandatory onboarding sheet. */
      nickname: string | null;
      /** Whether the user has agreed to 이용약관·개인정보처리방침 — false gates the mandatory onboarding sheet too. */
      termsAgreed: boolean;
      /** 트래블 메이트 신청/수락 알림 on/off — 기본 true. */
      notifyMateRequests: boolean;
      /** 좋아요 알림 on/off — 기본 true. */
      notifyLikes: boolean;
      /** 새 메시지 알림 on/off — 기본 true. */
      notifyMessages: boolean;
      /** 내 여행 후기에 달린 댓글 알림 on/off — 기본 true. */
      notifyComments: boolean;
      /** 신고 관리 화면(/admin/reports) 접근 및 정지 처리 권한. */
      isAdmin: boolean;
      /** 신고 처리로 정지된 계정인지 — true면 로그인 자체가 막힌다. */
      isBanned: boolean;
      /** 탈퇴 확인 이메일까지 완료해 유예기간(2주)이 시작된 시각 — null이면 탈퇴 진행 중이 아니다. */
      deletionRequestedAt: string | null;
      /** 유예기간이 끝나 계정이 영구 삭제될 시각(deletionRequestedAt + 2주) — deletionRequestedAt이 null이면 함께 null. */
      deletionPurgeAt: string | null;
      /** 트레쥴 프리미엄 멤버십 활성 여부 — premiumUntil이 지나면 자동으로 false. 결제 연동 전이라 지금은 항상 false. */
      isPremium: boolean;
      /** 프리미엄 만료 시각 — 구독 중이 아니면 null. */
      premiumUntil: string | null;
    } & DefaultSession["user"];
  }
}
