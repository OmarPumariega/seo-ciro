import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { MAX_SHORT } from "@/lib/validation";

const PRIORITIES = ["baja", "media", "alta"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tplId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { tplId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const data: { title?: string; detail?: string | null; priority?: string; category?: string | null } = {};
  if (typeof body.title === "string") {
    const t = body.title.trim().slice(0, 500);
    if (!t) return NextResponse.json({ error: "El título no puede quedar vacío" }, { status: 400 });
    data.title = t;
  }
  if (typeof body.detail === "string") {
    data.detail = body.detail.trim() ? body.detail.trim().slice(0, MAX_SHORT) : null;
  }
  if (PRIORITIES.includes(body.priority as (typeof PRIORITIES)[number])) {
    data.priority = body.priority as string;
  }
  if (typeof body.category === "string") {
    data.category = body.category.trim() ? body.category.trim().slice(0, 60) : null;
  }

  const updated = await prisma.todoTemplate.update({ where: { id: tplId }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tplId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { tplId } = await params;
  await prisma.todoTemplate.delete({ where: { id: tplId } });
  return NextResponse.json({ ok: true });
}
