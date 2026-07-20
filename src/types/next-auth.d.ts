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
    } & DefaultSession["user"];
  }
}
