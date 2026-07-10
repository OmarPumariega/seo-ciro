import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google/client";
import { listSites } from "@/lib/google/search-console";
import { listProperties } from "@/lib/google/analytics";
import { classifyGoogleError } from "@/lib/google/errors";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let auth;
  try {
    auth = await getGoogleClient();
  } catch (error) {
    if (error instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { error: "No hay ninguna cuenta de Google conectada. Ve a Configuración para conectarla." },
        { status: 409 }
      );
    }
    throw error;
  }

  try {
    const [gscSites, ga4Properties] = await Promise.all([listSites(auth), listProperties(auth)]);
    return NextResponse.json({ gscSites, ga4Properties, gbpStatus: "pendiente_aprobacion" });
  } catch (error) {
    const { status, message } = classifyGoogleError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
