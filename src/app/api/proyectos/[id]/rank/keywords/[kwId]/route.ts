import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

import { ALLOWED_DEPTHS } from "@/lib/rank/serp";

const DEVICES = ["desktop", "mobile"] as const;
const FREQUENCIES = ["manual", "daily", "weekly", "monthly"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kwId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, kwId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const existing = await prisma.rankKeyword.findUnique({ where: { id: kwId } });
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Keyword no encontrada" }, { status: 404 });
  }

  const data: { frequency?: string; device?: string; depth?: number } = {};
  if (typeof body.frequency === "string" && (FREQUENCIES as readonly string[]).includes(body.frequency)) {
    data.frequency = body.frequency;
  }
  if (typeof body.device === "string" && (DEVICES as readonly string[]).includes(body.device)) {
    data.device = body.device;
  }
  const rawDepth = Number(body.depth);
  if ((ALLOWED_DEPTHS as readonly number[]).includes(rawDepth)) {
    data.depth = rawDepth;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const updated = await prisma.rankKeyword.update({ where: { id: kwId }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; kwId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, kwId } = await params;
  const existing = await prisma.rankKeyword.findUnique({ where: { id: kwId } });
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Keyword no encontrada" }, { status: 404 });
  }

  // Cascade borra sus RankPosition (el histórico va con la keyword).
  await prisma.rankKeyword.delete({ where: { id: kwId } });
  return NextResponse.json({ ok: true });
}
