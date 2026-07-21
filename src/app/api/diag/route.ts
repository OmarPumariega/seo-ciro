import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveLocationName } from "@/lib/rank/locations";

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
  const nullLocationName = await prisma.rankKeyword.count({ where: { locationName: null } });
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

      // Para entender por qué los competidores no se muestran en la UI
      // aunque existan snapshots: mostramos cada competidor y su snapshot
      // más reciente, con los dominios tal cual están en BD (clave para
      // ver si el matchingCompetidor.domain === Snapshot.domain casa).
      const comps = await prisma.competitor.findMany({
        where: { projectId: p.id },
        select: {
          id: true,
          domain: true,
          contentGapAt: true,
        },
        take: 10,
      });
      const competitorsWithSnapshot = await Promise.all(
        comps.map(async (c) => {
          const lastSnap = await prisma.visibilitySnapshot.findFirst({
            where: { projectId: p.id, domain: c.domain },
            orderBy: { fetchedAt: "desc" },
            select: {
              domain: true,
              organicTraffic: true,
              organicKeywords: true,
              fetchedAt: true,
            },
          });
          return {
            id: c.id,
            competitorDomain: c.domain,
            contentGapAt: c.contentGapAt,
            snapshot: lastSnap,
            // Buscamos también por sufijo — a ver si el snapshot se guardó
            // con el dominio normalizado de otra forma.
            anySnapshotForProject: await prisma.visibilitySnapshot.count({
              where: { projectId: p.id },
            }),
          };
        })
      );

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
        keywordsWithPosition: withPosition,
        competitors: competitorsWithSnapshot,
      };
    })
  );

  return NextResponse.json({
    totals: {
      projects: totalProjects,
      projectsWithKeywords,
      rankKeywords: totalKeywords,
      rankKeywordsNeverChecked: neverChecked,
      rankKeywordsWithNullLocationName: nullLocationName,
      competitors: totalCompetitors,
      visibilitySnapshots: totalSnapshots,
      keywordsByFrequency: byFrequency,
    },
    projects: enriched,
  });
}

// Fix one-shot: rellena locationName en todas las RankKeyword donde sea null
// a partir del locationCode existente (usa el mismo JSON estático que
// LocationPicker). No toca las que ya tienen locationName. TEMPORAL — borrar
// cuando se confirme que el flujo funciona.
export async function POST(_req: NextRequest) {
  const candidates = await prisma.rankKeyword.findMany({
    where: { locationName: null },
    select: { id: true, locationCode: true },
  });
  let updated = 0;
  for (const rk of candidates) {
    const name = resolveLocationName(rk.locationCode);
    if (name) {
      await prisma.rankKeyword.update({
        where: { id: rk.id },
        data: { locationName: name },
      });
      updated++;
    }
  }
  return NextResponse.json({ checked: candidates.length, updated });
}
