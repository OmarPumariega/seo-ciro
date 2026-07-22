import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_SECTIONS,
  DEFAULT_ORDER,
  normalizeReportConfig,
} from "@/lib/informe/sections";
import {
  loadGlobalReportConfig,
  saveGlobalReportConfig,
  deleteGlobalReportConfig,
} from "@/lib/informe/global-config";

// Configuración global del informe (secciones activadas + orden). Aplica a
// TODOS los proyectos por defecto; cada proyecto puede tener su propio
// override (Project.reportConfig) que sobreescribe esta. Si no hay fila en
// GlobalSetting (deploy nuevo o nunca configurado), GET devuelve el default
// hardcoded (DEFAULT_SECTIONS/DEFAULT_ORDER) para que la UI muestre algo
// sensato desde el primer momento.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const cfg = await loadGlobalReportConfig();
  // loadGlobalReportConfig devuelve null si no hay fila en BD — en ese caso
  // devolvemos el default hardcoded para que la UI tenga algo que mostrar.
  // Distinguimos con el flag isCustom para que la UI sepa si es default real
  // o una global ya personalizada por el admin.
  if (!cfg) {
    return NextResponse.json({ sections: DEFAULT_SECTIONS, order: DEFAULT_ORDER, isCustom: false });
  }
  return NextResponse.json({ ...cfg, isCustom: true });
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

  try {
    const normalized = await saveGlobalReportConfig({
      sections: body.sections as never,
      order: body.order as never,
    });
    return NextResponse.json({ ...normalized, isCustom: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al guardar la configuración";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE borra la config global → los proyectos caen al default hardcoded.
// Útil si el admin quiere "empezar de cero".
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  await deleteGlobalReportConfig();
  return NextResponse.json({ sections: DEFAULT_SECTIONS, order: DEFAULT_ORDER, isCustom: false });
}
