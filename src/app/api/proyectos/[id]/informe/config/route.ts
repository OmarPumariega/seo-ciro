import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  SECTION_KEYS,
  normalizeReportConfig,
  type SectionKey,
  type ReportSections,
} from "@/lib/informe/sections";

// Configuración del informe por proyecto: qué secciones mostrar y en qué orden.
// El shape guardado es { sections: Record<key,bool>, order: SectionKey[] }. La
// lectura normaliza (back-compat con el shape viejo sin `order` y con menos
// claves) para que el cliente reciba siempre las 14 secciones.

function isSectionKey(k: unknown): k is SectionKey {
  return typeof k === "string" && (SECTION_KEYS as string[]).includes(k);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { reportConfig: true },
  });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const { sections, order } = normalizeReportConfig(project.reportConfig);
  return NextResponse.json({ sections, order });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  // sections: limpiar a claves conocidas + booleanos.
  const sections = { ...Object.fromEntries(SECTION_KEYS.map((k) => [k, true])) } as ReportSections;
  const incomingSections = body.sections;
  if (incomingSections && typeof incomingSections === "object") {
    const inc = incomingSections as Record<string, unknown>;
    for (const k of SECTION_KEYS) {
      if (typeof inc[k] === "boolean") sections[k] = inc[k];
    }
  }

  // order: permutación válida de SECTION_KEYS; si no, se ignora (mantiene default).
  let order: SectionKey[] = [...SECTION_KEYS];
  if (Array.isArray(body.order)) {
    const valid = body.order.filter(isSectionKey);
    const set = new Set(valid);
    if (valid.length === SECTION_KEYS.length && SECTION_KEYS.every((k) => set.has(k))) {
      order = valid;
    }
  }

  await prisma.project.update({
    where: { id },
    data: { reportConfig: { sections, order } },
  });

  return NextResponse.json({ ok: true });
}
