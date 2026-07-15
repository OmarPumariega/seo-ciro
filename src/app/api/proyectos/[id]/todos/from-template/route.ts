import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

// Aplica una o varias plantillas a este proyecto: crea un TodoItem por cada
// plantilla seleccionada, copiando título/detalle/prioridad. No duplica: si ya
// existe una tarea pendiente con el mismo templateId+title, se salta. Así se
// pueden re-aplicar las mismas plantillas en muchos proyectos sin ruido.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const rawIds = Array.isArray(body.templateIds) ? body.templateIds : [];
  const templateIds = rawIds.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  if (templateIds.length === 0) {
    return NextResponse.json({ error: "Selecciona al menos una plantilla" }, { status: 400 });
  }

  const templates = await prisma.todoTemplate.findMany({ where: { id: { in: templateIds } } });
  if (templates.length === 0) {
    return NextResponse.json({ error: "Plantillas no encontradas" }, { status: 404 });
  }

  // Evita duplicar tareas ya pendientes con la misma plantilla en este proyecto.
  const existing = await prisma.todoItem.findMany({
    where: { projectId: id, done: false, templateId: { in: templateIds } },
    select: { templateId: true },
  });
  const already = new Set(existing.map((t) => t.templateId));

  const toCreate = templates.filter((t) => !already.has(t.id));
  let created = 0;
  for (const t of toCreate) {
    const text = t.detail ? `${t.title}\n${t.detail}` : t.title;
    await prisma.todoItem.create({
      data: {
        projectId: id,
        text,
        title: t.title,
        detail: t.detail,
        priority: t.priority,
        templateId: t.id,
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped: templates.length - created });
}
