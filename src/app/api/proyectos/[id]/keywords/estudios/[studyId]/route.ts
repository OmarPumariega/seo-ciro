import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; studyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, studyId } = await params;

  const study = await prisma.keywordStudy.findUnique({
    where: { id: studyId },
    include: {
      // Orden secundario por volumen para desempatar prioridades que
      // redondean al mismo entero.
      keywords: { orderBy: [{ priority: "desc" }, { searchVolume: "desc" }] },
    },
  });

  // Verificación de propiedad: el study debe pertenecer al proyecto de la
  // ruta. Si no, 404 (no revelar existencia). Mismo patrón que
  // auditorias/[auditId]/route.ts.
  if (!study || study.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  return NextResponse.json(study);
}

// Edita el nombre y/o las notas del estudio.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; studyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, studyId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  // Verifica propiedad antes de tocar nada.
  const existing = await prisma.keywordStudy.findUnique({
    where: { id: studyId },
    select: { projectId: true },
  });
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  const data: { name?: string; notes?: string | null } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 120);
    if (name.length === 0) {
      return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    }
    data.name = name;
  }
  if (typeof body.notes === "string") {
    data.notes = body.notes.trim().slice(0, 2000);
  }
  // notes puede enviarse como null para vaciar el campo desde la UI.
  if (body.notes === null) {
    data.notes = null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const updated = await prisma.keywordStudy.update({
    where: { id: studyId },
    data,
    include: {
      keywords: { orderBy: [{ priority: "desc" }, { searchVolume: "desc" }] },
    },
  });
  return NextResponse.json(updated);
}

// Borra el estudio. onDelete: Cascade en Keyword se encarga de sus keywords.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; studyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, studyId } = await params;

  const existing = await prisma.keywordStudy.findUnique({
    where: { id: studyId },
    select: { projectId: true },
  });
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  await prisma.keywordStudy.delete({ where: { id: studyId } });
  return NextResponse.json({ ok: true });
}
