import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  NOTE_IMAGE_ALLOWED_TYPES,
  NOTE_IMAGE_MAX_COUNT,
  NOTE_IMAGE_MAX_SIZE,
} from "@/lib/notes/constants";

const IMAGE_SELECT = { id: true, mimeType: true, filename: true, size: true, createdAt: true };

async function getOwnedNote(projectId: string, noteId: string) {
  const note = await prisma.projectNote.findUnique({
    where: { id: noteId },
    select: { id: true, projectId: true, _count: { select: { images: true } } },
  });
  if (!note || note.projectId !== projectId) return null;
  return note;
}

// Sube una o varias fotos a un apunte ya existente. Se usa tanto al crear un
// apunte (el front-end crea la nota primero vía POST /notas y, si hay fotos
// pendientes, las sube aquí a continuación) como al editar uno existente —
// un único endpoint reutilizado en los dos flujos.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, noteId } = await params;
  const note = await getOwnedNote(id, noteId);
  if (!note) return NextResponse.json({ error: "Apunte no encontrado" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "No se ha adjuntado ninguna foto" }, { status: 400 });
  }
  if (note._count.images + files.length > NOTE_IMAGE_MAX_COUNT) {
    return NextResponse.json(
      { error: `Un apunte no puede tener más de ${NOTE_IMAGE_MAX_COUNT} fotos` },
      { status: 400 }
    );
  }
  for (const file of files) {
    if (!NOTE_IMAGE_ALLOWED_TYPES.includes(file.type as (typeof NOTE_IMAGE_ALLOWED_TYPES)[number])) {
      return NextResponse.json(
        { error: `Formato no soportado (${file.name || file.type}) — solo JPG, PNG, WEBP o GIF` },
        { status: 400 }
      );
    }
    if (file.size > NOTE_IMAGE_MAX_SIZE) {
      return NextResponse.json(
        {
          error: `${file.name || "una foto"} supera el tamaño máximo de ${
            NOTE_IMAGE_MAX_SIZE / (1024 * 1024)
          } MB`,
        },
        { status: 400 }
      );
    }
  }

  const buffers = await Promise.all(files.map((f) => f.arrayBuffer()));

  const created = await prisma.$transaction([
    ...files.map((file, i) =>
      prisma.projectNoteImage.create({
        data: {
          noteId,
          mimeType: file.type,
          filename: file.name || null,
          size: file.size,
          data: Buffer.from(buffers[i]),
        },
        select: IMAGE_SELECT,
      })
    ),
    // Marca el apunte como editado (misma señal "· editado" que un cambio de texto).
    prisma.projectNote.update({ where: { id: noteId }, data: {} }),
  ]);

  return NextResponse.json(created.slice(0, files.length), { status: 201 });
}
