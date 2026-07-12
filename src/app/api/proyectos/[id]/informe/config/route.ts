import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

// Secciones que el informe de un proyecto puede mostrar u ocultar. El orden de
// las claves aquí no importa — el orden de render lo marca InformeBuilder. Si
// algún día se añade una sección nueva, añadir aquí la clave con default true
// mantiene los informes existentes sin romperse (la ven activada por defecto).
const SECTION_KEYS = [
  "audit",
  "rank",
  "keywords",
  "geogrid",
  "costs",
  "tasks",
  "links",
  "competitors",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

type ReportSections = Record<SectionKey, boolean>;

function defaultSections(): ReportSections {
  const s = {} as ReportSections;
  for (const k of SECTION_KEYS) s[k] = true;
  return s;
}

// `reportConfig` se guarda como { sections: {...} } (ver POST). Al leer,
// toleramos null, un objeto sin `sections` o claves ausentes — siempre se
// rellena con los defaults para que el cliente reciba las 8 claves.
function readSections(raw: unknown): ReportSections {
  const base = defaultSections();
  if (!raw || typeof raw !== "object") return base;
  const sections = (raw as { sections?: unknown }).sections;
  if (!sections || typeof sections !== "object") return base;
  const s = sections as Record<string, unknown>;
  for (const k of SECTION_KEYS) {
    if (typeof s[k] === "boolean") base[k] = s[k];
  }
  return base;
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

  return NextResponse.json({ sections: readSections(project.reportConfig) });
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

  const sections = body.sections;
  if (!sections || typeof sections !== "object") {
    return NextResponse.json({ error: "Falta el objeto `sections`" }, { status: 400 });
  }

  // Solo persistimos las claves conocidas y como booleanos: evita que un
  // payload malicioso o un cliente desactualizado escriba basura en el Json.
  const clean = defaultSections();
  const incoming = sections as Record<string, unknown>;
  for (const k of SECTION_KEYS) {
    if (typeof incoming[k] === "boolean") clean[k] = incoming[k];
  }

  await prisma.project.update({
    where: { id },
    data: { reportConfig: { sections: clean } },
  });

  return NextResponse.json({ ok: true });
}
