import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Endpoint de diagnóstico PÚBLICO (sin auth, intencionalmente) para depurar
// por qué el cron de rank tracking dice "sin proyectos vencidos" aunque el
// usuario vea keywords en la UI. Solo devuelve contadores agregados, nunca
// datos sensibles (dominios, texto de keywords, etc.).
//
// TEMPORAL: borrar cuando se confirme que el flujo funciona.
export async function GET(_req: NextRequest) {
  const totalKeywords = await prisma.rankKeyword.count();
  const byFrequency = await prisma.rankKeyword.groupBy({
    by: ["frequency"],
    _count: true,
  });
  const neverChecked = await prisma.rankKeyword.count({ where: { lastCheckedAt: null } });
  const totalProjects = await prisma.project.count();
  const projectsWithKeywords = await prisma.project.count({
    where: { rankKeywords: { some: {} } },
  });

  const totalCompetitors = await prisma.competitor.count();
  const totalSnapshots = await prisma.visibilitySnapshot.count();

  // Detalle por proyecto (sin texto sensible: solo IDs y contadores).
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      domain: true,
      _count: { select: { rankKeywords: true, competitors: true, visibilitySnapshots: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Para cada proyecto, cuenta cuántas keywords nunca se han chequeado y su
  // distribución por frecuencia y por locationCode (para detectar keywords
  // que se crearon con ubicación equivocada — p.ej. España nacional cuando
  // el estudio es Oviedo).
  const enriched = await Promise.all(
    projects.map(async (p) => {
      const freqs = await prisma.rankKeyword.groupBy({
        by: ["frequency"],
        where: { projectId: p.id },
        _count: true,
      });
      const byLocation = await prisma.rankKeyword.groupBy({
        by: ["locationCode", "locationName"],
        where: { projectId: p.id },
        _count: true,
      });
      const never = await prisma.rankKeyword.count({
        where: { projectId: p.id, lastCheckedAt: null },
      });
      const withPosition = await prisma.rankKeyword.count({
        where: { projectId: p.id, lastPosition: { not: null } },
      });
      return {
        id: p.id,
        name: p.name,
        domain: p.domain,
        rankKeywordsCount: p._count.rankKeywords,
        competitorsCount: p._count.competitors,
        snapshotsCount: p._count.visibilitySnapshots,
        keywordsByFrequency: freqs,
        keywordsByLocation: byLocation,
        keywordsNeverChecked: never,
        keywordsWithPosition,
      };
    })
  );

  return NextResponse.json({
    totals: {
      projects: totalProjects,
      projectsWithKeywords,
      rankKeywords: totalKeywords,
      rankKeywordsNeverChecked: neverChecked,
      competitors: totalCompetitors,
      visibilitySnapshots: totalSnapshots,
      keywordsByFrequency: byFrequency,
    },
    projects: enriched,
  });
}
