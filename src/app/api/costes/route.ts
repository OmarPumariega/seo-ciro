import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getMonthSpendUsd, getMonthlyLimitUsd, getProjectMonthSpendUsd } from "@/lib/dataforseo/spend";

// Panel de costes (sección 5 del spec): consumo acumulado del mes por API,
// endpoint y proyecto. Cubre TODA la actividad de API de pago registrada en
// ApiUsageLog (DataForSEO + OpenRouter), no solo DataForSEO.
//
// Con ?projectId=<id> filtra TODO a ese proyecto en vez del agregado global:
// mismo desglose por tipo de llamada/módulo pero solo su gasto, comparado
// contra su propio tope (Project.spendLimitUsd) en vez del global, más el
// listado de llamadas individuales recientes para trazabilidad total.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = startOfMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, spendLimitUsd: true },
    });
    if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    const where = { projectId, createdAt: { gte: startOfMonth } };
    const [byEndpointRows, totalAgg, projectDfsSpent, recentCalls] = await Promise.all([
      prisma.apiUsageLog.groupBy({ by: ["api", "endpoint"], where, _sum: { costUsd: true }, _count: true }),
      prisma.apiUsageLog.aggregate({ where, _sum: { costUsd: true } }),
      getProjectMonthSpendUsd(projectId),
      prisma.apiUsageLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, api: true, endpoint: true, model: true, costUsd: true, createdAt: true },
      }),
    ]);

    const limit = project.spendLimitUsd ?? null;

    return NextResponse.json({
      monthLabel,
      scope: "project",
      project: { id: project.id, name: project.name },
      dataforseo: {
        spentUsd: projectDfsSpent,
        limitUsd: limit,
        nearLimit: limit !== null && projectDfsSpent >= limit * 0.8,
        blocked: limit !== null && projectDfsSpent >= limit,
      },
      totalUsd: totalAgg._sum.costUsd ? Number(totalAgg._sum.costUsd) : 0,
      byEndpoint: byEndpointRows
        .map((r) => ({
          api: r.api,
          endpoint: r.endpoint,
          cost: r._sum.costUsd ? Number(r._sum.costUsd) : 0,
          count: r._count,
        }))
        .sort((a, b) => b.cost - a.cost),
      byProject: [],
      recentCalls: recentCalls.map((c) => ({
        id: c.id,
        api: c.api,
        endpoint: c.endpoint,
        model: c.model,
        cost: c.costUsd ? Number(c.costUsd) : 0,
        createdAt: c.createdAt,
      })),
    });
  }

  const where = { createdAt: { gte: startOfMonth } };

  const [byEndpointRows, byProjectRows, totalAgg] = await Promise.all([
    prisma.apiUsageLog.groupBy({
      by: ["api", "endpoint"],
      where,
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.apiUsageLog.groupBy({
      by: ["projectId"],
      where,
      _sum: { costUsd: true },
    }),
    prisma.apiUsageLog.aggregate({ where, _sum: { costUsd: true } }),
  ]);

  // Nombres de proyecto para el desglose por proyecto (algunos pueden ser null
  // si el proyecto se borró — ApiUsageLog sobrevive con onDelete: SetNull).
  const projectIds = byProjectRows
    .map((r) => r.projectId)
    .filter((id): id is string => id !== null);
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true, spendLimitUsd: true },
  });
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const projectLimit = new Map(
    projects.map((p) => [p.id, p.spendLimitUsd ?? null])
  );

  const dataforseoSpent = await getMonthSpendUsd();
  const limit = getMonthlyLimitUsd();

  return NextResponse.json({
    monthLabel,
    scope: "global",
    project: null,
    dataforseo: {
      spentUsd: dataforseoSpent,
      limitUsd: limit,
      nearLimit: limit !== null && dataforseoSpent >= limit * 0.8,
      blocked: limit !== null && dataforseoSpent >= limit,
    },
    totalUsd: totalAgg._sum.costUsd ? Number(totalAgg._sum.costUsd) : 0,
    byEndpoint: byEndpointRows
      .map((r) => ({
        api: r.api,
        endpoint: r.endpoint,
        cost: r._sum.costUsd ? Number(r._sum.costUsd) : 0,
        count: r._count,
      }))
      .sort((a, b) => b.cost - a.cost),
    byProject: byProjectRows
      .map((r) => ({
        projectId: r.projectId,
        name: r.projectId ? (projectName.get(r.projectId) ?? "Proyecto eliminado") : "Sin proyecto",
        cost: r._sum.costUsd ? Number(r._sum.costUsd) : 0,
        limit: r.projectId ? (projectLimit.get(r.projectId) ?? null) : null,
      }))
      .sort((a, b) => b.cost - a.cost),
    recentCalls: [],
  });
}
