import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getUserByUsername } from "./sheets";
import type { SessionUser } from "@/types";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }
        try {
          const user = await getUserByUsername(credentials.username);
          if (!user) return null;
          // Spec: Admin sets plain password in Sheet. For production hash with bcrypt.
          // Here we support both plain match and bcrypt for flexibility.
          // NOTE: bcrypt.compare returns a Promise -> it MUST be awaited,
          // otherwise the Promise is always truthy and ANY password passes.
          let isValid = user.password === credentials.password;
          if (!isValid && user.password.startsWith("$2")) {
            const bcrypt = await import("bcryptjs");
            isValid = await bcrypt.compare(credentials.password, user.password);
          }
          if (!isValid) return null;
          if (user.status !== "ACTIVE") return null;

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
            employeeId: user.employeeId,
          } as SessionUser & { id: string };
        } catch (err) {
          // System failure (Google Sheets timeout / quota / network).
          // Throw so the login page can say "system error, try again"
          // instead of wrongly saying "wrong username or password".
          console.error("Auth error:", err);
          throw new Error("SERVICE_UNAVAILABLE");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as SessionUser).role;
        token.username = (user as SessionUser).username;
        token.employeeId = (user as SessionUser).employeeId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as SessionUser).id = token.id as string;
        (session.user as SessionUser).role = token.role as SessionUser["role"];
        (session.user as SessionUser).username = token.username as string;
        (session.user as SessionUser).employeeId = token.employeeId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
};