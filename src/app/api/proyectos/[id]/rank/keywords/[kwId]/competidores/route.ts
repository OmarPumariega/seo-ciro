import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

// Última posición conocida de cada competidor trackeado para esta keyword —
// localizada dentro del mismo SERP que ya se pagó al comprobar la posición
// propia (ver src/lib/rank/check.ts), nunca una llamada aparte.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; kwId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, kwId } = await params;
  const kw = await prisma.rankKeyword.findUnique({ where: { id: kwId } });
  if (!kw || kw.projectId !== id) {
    return NextResponse.json({ error: "Keyword no encontrada" }, { status: 404 });
  }

  const rows = await prisma.rankCompetitorPosition.findMany({
    where: { rankKeywordId: kwId },
    orderBy: { checkedAt: "desc" },
  });

  // Nos quedamos con la fila más reciente por dominio (rows ya viene desc).
  const latestByDomain = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByDomain.has(row.competitorDomain)) latestByDomain.set(row.competitorDomain, row);
  }

  const result = [...latestByDomain.values()]
    .map((r) => ({
      domain: r.competitorDomain,
      position: r.position,
      url: r.url,
      checkedAt: r.checkedAt,
    }))
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));

  return NextResponse.json(result);
}
