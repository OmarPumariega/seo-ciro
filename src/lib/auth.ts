import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { loginIpLimiter, loginEmailLimiter, getClientIp } from "@/lib/rate-limit";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/acceso" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.trim();
        if (!email || !credentials?.password) return null;

        // Rate limit: frena fuerza bruta por IP y por email.
        const headers = ((req as { headers?: Record<string, string> })?.headers) ?? {};
        const ip = getClientIp(headers);
        try {
          await loginIpLimiter.consume(ip || "unknown", 1);
        } catch {
          return null;
        }
        try {
          await loginEmailLimiter.consume(email, 1);
        } catch {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const passwordMatch = await bcrypt.compare(credentials.password, user.password);
        if (!passwordMatch) return null;

        try {
          await loginEmailLimiter.delete(email);
        } catch {
          // noop
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role;
      return session;
    },
  },
};
