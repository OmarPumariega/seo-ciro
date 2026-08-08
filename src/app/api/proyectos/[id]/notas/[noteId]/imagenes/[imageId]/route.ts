import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

async function getOwnedImage(projectId: string, noteId: string, imageId: string) {
  const image = await prisma.projectNoteImage.findUnique({
    where: { id: imageId },
    include: { note: { select: { projectId: true } } },
  });
  if (!image || image.noteId !== noteId || image.note.projectId !== projectId) return null;
  return image;
}

// Sirve los bytes de una foto adjunta. La sesión de NextAuth viaja en la
// petición del <img> igual que en cualquier fetch same-origin (cookie
// SameSite=Lax), así que sigue detrás de login sin necesitar un token en la URL.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string; imageId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, noteId, imageId } = await params;
  const image = await getOwnedImage(id, noteId, imageId);
  if (!image) return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });

  return new NextResponse(image.data, {
    headers: {
      "Content-Type": image.mimeType,
      // Inmutable: una edición nunca sobreescribe una imagen ya subida, crea
      // una fila nueva — así que el navegador puede cachearla para siempre.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string; imageId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, noteId, imageId } = await params;
  const image = await getOwnedImage(id, noteId, imageId);
  if (!image) return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });

  await prisma.$transaction([
    prisma.projectNoteImage.delete({ where: { id: imageId } }),
    prisma.projectNote.update({ where: { id: noteId }, data: {} }),
  ]);

  return NextResponse.json({ ok: true });
}
