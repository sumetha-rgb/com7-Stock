import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getUserById, getUserByUsername } from "./sheets";
import type { SessionUser } from "@/types";

const SESSION_USER_CACHE_MS = 5_000;
const SHEETS_AUTH_RETRY_COOLDOWN_MS = 30_000;
const sessionUserCache = new Map<string, { checkedAt: number; user: Awaited<ReturnType<typeof getUserById>> }>();
let sheetsAuthRetryAfter = 0;

function isTransientSheetsError(error: unknown): boolean {
  const value = error as {
    code?: string | number;
    status?: string | number;
    message?: string;
    cause?: { code?: string | number; message?: string };
  } | null;
  const code = String(value?.code ?? value?.cause?.code ?? value?.status ?? "");
  const message = `${value?.message ?? ""} ${value?.cause?.message ?? ""} ${String(error ?? "")}`;
  return ["EAI_AGAIN", "ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "ECONNABORTED"].includes(code)
    || code === "429"
    || /^5\d\d$/.test(code)
    || /network timeout|getaddrinfo|socket hang up/i.test(message);
}

async function getCurrentSessionUser(id: string) {
  const cached = sessionUserCache.get(id);
  if (cached && Date.now() - cached.checkedAt < SESSION_USER_CACHE_MS) return cached.user;
  // Use the Sheets cache here so a temporary Google API outage can fall back
  // to the last known Users snapshot instead of breaking every session read.
  const user = await getUserById(id);
  sessionUserCache.set(id, { checkedAt: Date.now(), user });
  return user;
}

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
        token.revoked = false;
      } else if (token.revoked) {
        // Revocation is sticky for this token; a re-enabled account must log in again.
        return token;
      } else if (token.id) {
        if (Date.now() < sheetsAuthRetryAfter) return token;
        try {
          // Refresh role/status from Users. On a confirmed missing or inactive
          // account, revoke the token; a transient network failure is handled
          // below and must not be mistaken for account deletion.
          const currentUser = await getCurrentSessionUser(token.id);
          sheetsAuthRetryAfter = 0;
          if (!currentUser || currentUser.status !== "ACTIVE") {
            token.revoked = true;
          } else {
            token.role = currentUser.role;
            token.username = currentUser.username;
            token.employeeId = currentUser.employeeId;
          }
        } catch (error) {
          if (!isTransientSheetsError(error)) throw error;
          // Preserve this already authenticated JWT briefly while Google Sheets
          // has a DNS/network hiccup, then retry the status check.
          sheetsAuthRetryAfter = Date.now() + SHEETS_AUTH_RETRY_COOLDOWN_MS;
          console.warn("Temporary Google Sheets outage during session refresh; keeping the existing session until retry.");
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.revoked) {
        return { expires: session.expires } as typeof session;
      }
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
