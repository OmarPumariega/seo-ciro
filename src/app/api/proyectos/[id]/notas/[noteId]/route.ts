import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { NOTE_CONTENT_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH } from "@/lib/notes/constants";
import { stripHtmlToText } from "@/lib/notes/strip-html";

const IMAGE_SELECT = { id: true, mimeType: true, filename: true, size: true, createdAt: true };

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

  // El título es opcional y se puede editar solo (sin volver a mandar el
  // contenido) — si no viene en el body, se deja como está.
  const titleProvided = typeof body.title === "string";
  const titleRaw = titleProvided ? (body.title as string).trim() : "";
  if (titleProvided && titleRaw.length > NOTE_TITLE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `El título no puede superar los ${NOTE_TITLE_MAX_LENGTH} caracteres` },
      { status: 400 }
    );
  }

  const content = typeof body.content === "string" ? body.content : "";
  if (!stripHtmlToText(content)) {
    return NextResponse.json({ error: "El apunte no puede estar vacío" }, { status: 400 });
  }
  if (content.length > NOTE_CONTENT_MAX_LENGTH) {
    return NextResponse.json(
      { error: `El apunte no puede superar los ${NOTE_CONTENT_MAX_LENGTH} caracteres` },
      { status: 400 }
    );
  }

  const updated = await prisma.projectNote.update({
    where: { id: noteId },
    data: { content, ...(titleProvided ? { title: titleRaw || null } : {}) },
    include: { images: { select: IMAGE_SELECT, orderBy: { createdAt: "asc" } } },
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

  // Las imágenes del apunte se borran solas (onDelete: Cascade en ProjectNoteImage).
  await prisma.projectNote.delete({ where: { id: noteId } });

  return NextResponse.json({ ok: true });
}
