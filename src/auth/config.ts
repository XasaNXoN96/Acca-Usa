import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/types";

/**
 * Auth.js configuration — PREPARED for the backend block, intentionally NOT wired up:
 *  - no providers are registered, so no sign-in can succeed
 *  - there is no /api/auth route handler yet
 * Next stage: add the Prisma adapter, a Credentials/OAuth provider with hashed passwords,
 * `export const { auth, handlers, signIn, signOut } = NextAuth(authConfig)` and a `proxy.ts`
 * route guard driven by lib/permissions.ts. Until then services/mock/account.ts returns a flagged demo session.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: Role }).role ?? "STUDENT";
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as Role | undefined) ?? "STUDENT";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
