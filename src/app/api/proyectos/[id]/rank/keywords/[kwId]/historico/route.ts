import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

// Histórico de posiciones de una keyword para la gráfica de evolución.
// Limitado a las últimas N mediciones (suficiente para ver la tendencia sin
// cargar la respuesta).
const LIMIT = 90;

export async function GET(
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

  const positions = await prisma.rankPosition.findMany({
    where: { rankKeywordId: kwId },
    orderBy: { checkedAt: "desc" },
    take: LIMIT,
  });

  // Devuelto en orden cronológico ascendente (más antiguo → más reciente),
  // que es el orden natural para pintar la evolución.
  return NextResponse.json(positions.reverse());
}
