import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthUrl, GoogleOAuthConfigError } from "@/lib/google/oauth";

const STATE_COOKIE = "google_oauth_state";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL("/admin/acceso", req.url));

  const state = randomBytes(16).toString("hex");
  let authUrl: string;
  try {
    authUrl = await buildAuthUrl(state);
  } catch (error) {
    // Config incompleta (falta Client ID/Secret/Redirect URI): en vez de un
    // 500 mudo, manda a Configuración con un mensaje claro.
    if (error instanceof GoogleOAuthConfigError) {
      const url = new URL("/admin/configuracion", req.url);
      url.searchParams.set("error", "configuracion_incompleta");
      return NextResponse.redirect(url);
    }
    throw error;
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return response;
}
