import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import Apple from "next-auth/providers/apple";
import PostgresAdapter from "@auth/pg-adapter";
import { pool } from "@/lib/server/db";

// Only register a provider once its credentials are actually configured,
// so a missing Apple/Kakao/Google setup doesn't break the others.
//
// allowDangerousEmailAccountLinking: Auth.js's default refuses to attach a
// new provider to an existing user just because the email matches (a
// provider that doesn't verify email ownership could otherwise let someone
// hijack an account by signing up with your address). Google/Kakao/Apple
// all verify the email themselves before reporting it, so for this app's
// user base the realistic case is the same person owning both a 카카오
// and a 구글 account under one email — trust that match instead of forcing
// them into two disconnected accounts.
const providers = [
  ...(process.env.AUTH_GOOGLE_ID ? [Google({ allowDangerousEmailAccountLinking: true })] : []),
  ...(process.env.AUTH_KAKAO_ID ? [Kakao({ allowDangerousEmailAccountLinking: true })] : []),
  ...(process.env.AUTH_APPLE_ID ? [Apple({ allowDangerousEmailAccountLinking: true })] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers,
  session: { strategy: "database" },
  trustHost: true,
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // The adapter's AdapterUser shape only covers the standard Auth.js
        // columns (id/name/email/image/emailVerified) — nickname/termsAgreedAt
        // are our own additions, so they're fetched separately rather than
        // relying on the adapter to surface them.
        const result = await pool.query(`select nickname, "termsAgreedAt" from users where id = $1`, [user.id]);
        session.user.nickname = result.rows[0]?.nickname ?? null;
        session.user.termsAgreed = result.rows[0]?.termsAgreedAt != null;
      }
      return session;
    },
  },
});
