import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

// Tendencia de visibilidad de un dominio (tráfico/keywords a lo largo del
// tiempo, según se van acumulando snapshots al analizar). Sin coste (lee
// históórico local). ?domain=X — si no viene, usa el dominio del proyecto.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const domain = req.nextUrl.searchParams.get("domain");

  const snapshots = await prisma.visibilitySnapshot.findMany({
    where: domain ? { projectId: id, domain } : { projectId: id },
    orderBy: { fetchedAt: "asc" },
    select: { domain: true, organicTraffic: true, organicKeywords: true, fetchedAt: true },
    take: 100,
  });

  return NextResponse.json(snapshots);
}
