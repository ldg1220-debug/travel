import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** User-chosen public display name, set during profile setup. Null until then — gates the mandatory onboarding sheet. */
      nickname: string | null;
    } & DefaultSession["user"];
  }
}
