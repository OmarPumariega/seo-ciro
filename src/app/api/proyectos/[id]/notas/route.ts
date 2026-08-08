import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { NOTE_CONTENT_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH } from "@/lib/notes/constants";
import { stripHtmlToText } from "@/lib/notes/strip-html";

// Metadatos de imagen sin el campo `data` (los bytes solo se sirven, de uno
// en uno, desde la ruta dedicada [noteId]/imagenes/[imageId] — incluirlos
// aquí inflaría el listado de notas con megabytes de base64 innecesarios).
const IMAGE_SELECT = { id: true, mimeType: true, filename: true, size: true, createdAt: true };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  // Más recientes primero.
  const notes = await prisma.projectNote.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: { images: { select: IMAGE_SELECT, orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json(notes);
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

  const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
  if (titleRaw.length > NOTE_TITLE_MAX_LENGTH) {
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

  const note = await prisma.projectNote.create({
    data: { projectId: id, title: titleRaw || null, content },
    include: { images: { select: IMAGE_SELECT } },
  });

  return NextResponse.json(note, { status: 201 });
}
