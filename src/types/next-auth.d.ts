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
      /** 신고 관리 화면(/admin/reports) 접근 및 정지 처리 권한. */
      isAdmin: boolean;
      /** 신고 처리로 정지된 계정인지 — true면 로그인 자체가 막힌다. */
      isBanned: boolean;
    } & DefaultSession["user"];
  }
}
