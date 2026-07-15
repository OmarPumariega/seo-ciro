import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

// Lectura ligera del ÚLTIMO snapshot de Search Console persistido para el
// proyecto (lo guarda el panel de GSC al abrirlo). No llama a la API de Google
// ni gasta: es un simple read de BD. Lo usan paneles que quieren mostrar la
// visibilidad del dominio (auditoría, etc.) sin disparar coste.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const snap = await prisma.gscSnapshot.findFirst({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: { totals: true, topQueries: true, month: true, rangeDays: true },
  });

  if (!snap) return NextResponse.json({ snapshot: null });

  const totals = snap.totals as { clicks?: number; impressions?: number; ctr?: number; position?: number } | null;
  const queries = Array.isArray(snap.topQueries) ? snap.topQueries.length : 0;
  return NextResponse.json({
    snapshot: {
      clicks: totals?.clicks ?? 0,
      impressions: totals?.impressions ?? 0,
      ctr: totals?.ctr ?? 0,
      position: totals?.position ?? 0,
      queries,
      month: snap.month,
      rangeDays: snap.rangeDays,
    },
  });
}
