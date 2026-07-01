import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import Apple from "next-auth/providers/apple";
import PostgresAdapter from "@auth/pg-adapter";
import { pool } from "@/lib/server/db";

// Only register a provider once its credentials are actually configured,
// so a missing Apple/Kakao/Google setup doesn't break the others.
const providers = [
  ...(process.env.AUTH_GOOGLE_ID ? [Google] : []),
  ...(process.env.AUTH_KAKAO_ID ? [Kakao] : []),
  ...(process.env.AUTH_APPLE_ID ? [Apple] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers,
  session: { strategy: "database" },
  trustHost: true,
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
