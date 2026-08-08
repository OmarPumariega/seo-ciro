import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, noteId } = await params;

  const note = await prisma.projectNote.findUnique({ where: { id: noteId } });
  // Verificación de propiedad: el apunte debe pertenecer al proyecto de la
  // ruta. Si no, 404 (no revelar existencia). Mismo patrón que todos/[todoId].
  if (!note || note.projectId !== id) {
    return NextResponse.json({ error: "Apunte no encontrado" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "El apunte no puede estar vacío" }, { status: 400 });
  }
  if (content.length > 10000) {
    return NextResponse.json({ error: "El apunte no puede superar los 10.000 caracteres" }, { status: 400 });
  }

  const updated = await prisma.projectNote.update({
    where: { id: noteId },
    data: { content },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, noteId } = await params;

  const note = await prisma.projectNote.findUnique({ where: { id: noteId } });
  if (!note || note.projectId !== id) {
    return NextResponse.json({ error: "Apunte no encontrado" }, { status: 404 });
  }

  await prisma.projectNote.delete({ where: { id: noteId } });

  return NextResponse.json({ ok: true });
}
