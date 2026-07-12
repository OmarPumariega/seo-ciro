import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  // Pendientes primero (done false < true), luego por creación descendente.
  const todos = await prisma.todoItem.findMany({
    where: { projectId: id },
    orderBy: [{ done: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(todos);
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

  // title (preferido) con fallback a text (legacy). El title se guarda aparte
  // y además se reconstruye text="title\ndetail" para compat con Informe.
  const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  const title = rawTitle || rawText;
  if (!title) {
    return NextResponse.json({ error: "El título de la tarea es obligatorio" }, { status: 400 });
  }
  if (title.length > 500) {
    return NextResponse.json({ error: "El título no puede superar los 500 caracteres" }, { status: 400 });
  }

  const rawDetail = typeof body.detail === "string" ? body.detail.trim() : "";

  let priority = "media";
  if (body.priority !== undefined && body.priority !== null) {
    if (typeof body.priority !== "string" || !["baja", "media", "alta"].includes(body.priority)) {
      return NextResponse.json({ error: "Prioridad inválida" }, { status: 400 });
    }
    priority = body.priority;
  }

  let dueDate: Date | undefined;
  if (body.dueDate !== undefined && body.dueDate !== null) {
    if (typeof body.dueDate !== "string") {
      return NextResponse.json({ error: "Fecha de vencimiento inválida" }, { status: 400 });
    }
    const parsed = new Date(body.dueDate);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Fecha de vencimiento inválida" }, { status: 400 });
    }
    dueDate = parsed;
  }

  // text mantiene el formato legacy "title\ndetail" para Informe y otros
  // consumidores que aún separan por saltos de línea (splitManualTask).
  const text = rawDetail ? `${title}\n${rawDetail}` : title;

  const todo = await prisma.todoItem.create({
    data: {
      projectId: id,
      text,
      title,
      detail: rawDetail || undefined,
      priority,
      dueDate,
    },
  });

  return NextResponse.json(todo, { status: 201 });
}
