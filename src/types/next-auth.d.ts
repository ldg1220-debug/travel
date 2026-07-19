import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** User-chosen public display name, set during profile setup. Null until then — gates the mandatory onboarding sheet. */
      nickname: string | null;
      /** Whether the user has agreed to 이용약관·개인정보처리방침 — false gates the mandatory onboarding sheet too. */
      termsAgreed: boolean;
    } & DefaultSession["user"];
  }
}
