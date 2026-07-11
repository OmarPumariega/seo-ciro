import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

// Activa/desactiva la programación mensual automática de auditorías del
// Módulo 8. Solo toca project.auditFrequency; la creación real de la AuditRun
// la hace el cron (runAuditJob → scheduleMonthlyAudit).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const frequency = typeof body.frequency === "string" ? body.frequency : "";
  if (frequency !== "manual" && frequency !== "monthly") {
    return NextResponse.json({ error: "Frecuencia no válida" }, { status: 400 });
  }

  try {
    const project = await prisma.project.update({
      where: { id },
      data: { auditFrequency: frequency },
      select: { auditFrequency: true },
    });
    return NextResponse.json({ auditFrequency: project.auditFrequency });
  } catch (error) {
    // P2025 = "Record not found" — el proyecto no existe.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    throw error;
  }
}
