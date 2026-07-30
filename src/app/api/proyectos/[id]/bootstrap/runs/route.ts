import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

// Últimos BootstrapRun del proyecto, para que el frontend sepa al montar si
// hay uno pending/running que retomar con polling, o el último
// completed/failed cuyo resultado mostrar sin relanzar nada.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const runs = await prisma.bootstrapRun.findMany({
    where: { projectId: id },
    orderBy: { triggeredAt: "desc" },
    take: 5,
  });

  return NextResponse.json(runs);
}
