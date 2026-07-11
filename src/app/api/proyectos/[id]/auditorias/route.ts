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
  const runs = await prisma.auditRun.findMany({
    where: { projectId: id },
    orderBy: { triggeredAt: "desc" },
    take: 20,
  });

  return NextResponse.json(runs);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  if (!project.domain) {
    return NextResponse.json(
      {
        error:
          "Este proyecto no tiene dominio configurado. Añádelo en la ficha del proyecto antes de auditarlo.",
      },
      { status: 400 }
    );
  }

  const existing = await prisma.auditRun.findFirst({
    where: { projectId: id, status: { in: ["pending", "running"] } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Ya hay una auditoría en curso para este proyecto." },
      { status: 409 }
    );
  }

  const run = await prisma.auditRun.create({
    data: {
      projectId: id,
      startUrl: `https://${project.domain}`,
    },
  });

  // Dispara el procesamiento EN BACKGROUND (import dinámico + fire-and-forget).
  // Así funciona en dev (el cron NO corre en dev) y en producción sin esperar
  // al siguiente tick del cron. La UI hace polling para ver el resultado.
  import("@/lib/audit/job")
    .then(({ runAuditJob }) => runAuditJob())
    .catch((e) => console.error("[audit] fire-and-forget:", e));

  return NextResponse.json(run, { status: 202 });
}
