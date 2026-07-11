import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, todoId } = await params;

  const todo = await prisma.todoItem.findUnique({ where: { id: todoId } });
  // Verificación de propiedad: el todo debe pertenecer al proyecto de la ruta.
  // Si no, 404 (no revelar existencia). Mismo patrón que estudios/[studyId].
  if (!todo || todo.projectId !== id) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const data: {
    text?: string;
    done?: boolean;
    dueDate?: Date | null;
    completedAt?: Date | null;
  } = {};

  if (typeof body.text === "string") {
    const trimmed = body.text.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "El texto de la tarea es obligatorio" }, { status: 400 });
    }
    if (trimmed.length > 500) {
      return NextResponse.json({ error: "El texto no puede superar los 500 caracteres" }, { status: 400 });
    }
    data.text = trimmed;
  }

  if (typeof body.done === "boolean") {
    data.done = body.done;
    data.completedAt = body.done ? new Date() : null;
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate === null) {
      data.dueDate = null;
    } else if (typeof body.dueDate === "string") {
      const parsed = new Date(body.dueDate);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Fecha de vencimiento inválida" }, { status: 400 });
      }
      data.dueDate = parsed;
    } else {
      return NextResponse.json({ error: "Fecha de vencimiento inválida" }, { status: 400 });
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(todo);
  }

  const updated = await prisma.todoItem.update({
    where: { id: todoId },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; todoId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, todoId } = await params;

  const todo = await prisma.todoItem.findUnique({ where: { id: todoId } });
  if (!todo || todo.projectId !== id) {
    return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  }

  await prisma.todoItem.delete({ where: { id: todoId } });

  return NextResponse.json({ ok: true });
}
