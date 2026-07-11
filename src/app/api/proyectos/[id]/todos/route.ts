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

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  if (!rawText) {
    return NextResponse.json({ error: "El texto de la tarea es obligatorio" }, { status: 400 });
  }
  if (rawText.length > 500) {
    return NextResponse.json({ error: "El texto no puede superar los 500 caracteres" }, { status: 400 });
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

  const todo = await prisma.todoItem.create({
    data: {
      projectId: id,
      text: rawText,
      dueDate,
    },
  });

  return NextResponse.json(todo, { status: 201 });
}
