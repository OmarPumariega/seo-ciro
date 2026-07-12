import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { getSettingsStatus, setSetting, clearSetting, type SettingKey } from "@/lib/settings";
import { SETTINGS_KEYS } from "@/lib/settings-catalog";

function isSettingKey(v: unknown): v is SettingKey {
  return typeof v === "string" && SETTINGS_KEYS.has(v);
}

// Nunca devuelve el valor real de ningún ajuste — solo si está configurado y
// de dónde viene (BD o variable de entorno). El propio texto del secreto no
// vuelve a salir del servidor una vez guardado.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const status = await getSettingsStatus();
  return NextResponse.json(status);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const key = body.key;
  if (!isSettingKey(key)) {
    return NextResponse.json({ error: "Clave de ajuste desconocida" }, { status: 400 });
  }
  const value = typeof body.value === "string" ? body.value : "";
  if (!value.trim()) {
    return NextResponse.json({ error: "El valor no puede estar vacío" }, { status: 400 });
  }

  await setSetting(key, value);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const key = req.nextUrl.searchParams.get("key");
  if (!isSettingKey(key)) {
    return NextResponse.json({ error: "Clave de ajuste desconocida" }, { status: 400 });
  }

  await clearSetting(key);
  return NextResponse.json({ ok: true });
}
