import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthUrl } from "@/lib/google/oauth";

const STATE_COOKIE = "google_oauth_state";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL("/admin/acceso", req.url));

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildAuthUrl(state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return response;
}
