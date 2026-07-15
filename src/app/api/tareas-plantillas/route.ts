import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { MAX_SHORT } from "@/lib/validation";

// Catálogo global de tareas preestablecidas (no por proyecto). La agencia crea
// aquí tareas recurrentes y las aplica a cada proyecto desde la pestaña Tareas.

const PRIORITIES = ["baja", "media", "alta"] as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const templates = await prisma.todoTemplate.findMany({
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 500) : "";
  if (!title) return NextResponse.json({ error: "El título es obligatorio" }, { status: 400 });

  const detail = typeof body.detail === "string" && body.detail.trim() ? body.detail.trim().slice(0, MAX_SHORT) : null;
  const priority = PRIORITIES.includes(body.priority as (typeof PRIORITIES)[number])
    ? (body.priority as string)
    : "media";
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim().slice(0, 60) : null;

  const tpl = await prisma.todoTemplate.create({ data: { title, detail, priority, category } });
  return NextResponse.json(tpl, { status: 201 });
}
