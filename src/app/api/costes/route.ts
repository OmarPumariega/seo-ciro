import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getMonthlyLimitUsd } from "@/lib/dataforseo/spend";

// Panel de costes (sección 5 del spec): consumo acumulado del mes por API,
// endpoint y proyecto. Cubre TODA la actividad de API de pago registrada en
// ApiUsageLog (DataForSEO + OpenRouter), no solo DataForSEO.
//
// Con ?projectId=<id> filtra TODO a ese proyecto en vez del agregado global.
// Con ?year=&month=(1-12) filtra a ese mes natural en vez del actual — el
// tope y el estado "bloqueado" solo tienen sentido para el mes en curso (es
// una restricción en vivo), así que para meses pasados se muestra el gasto
// real de ese mes comparado contra el tope ACTUAL a título informativo, sin
// pintarlo como bloqueado.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");

  const now = new Date();
  const rawYear = Number(req.nextUrl.searchParams.get("year"));
  const rawMonth = Number(req.nextUrl.searchParams.get("month")); // 1-12
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 3000 ? rawYear : now.getFullYear();
  const month = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : now.getMonth() + 1;

  const startOfMonth = new Date(year, month - 1, 1);
  const startOfNextMonth = new Date(year, month, 1);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const monthLabel = startOfMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, spendLimitUsd: true },
    });
    if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    const where = { projectId, createdAt: { gte: startOfMonth, lt: startOfNextMonth } };
    const [byEndpointRows, totalAgg, dataforseoAgg, recentCalls] = await Promise.all([
      prisma.apiUsageLog.groupBy({ by: ["api", "endpoint"], where, _sum: { costUsd: true }, _count: true }),
      prisma.apiUsageLog.aggregate({ where, _sum: { costUsd: true } }),
      prisma.apiUsageLog.aggregate({ where: { ...where, api: "dataforseo" }, _sum: { costUsd: true } }),
      prisma.apiUsageLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, api: true, endpoint: true, model: true, costUsd: true, createdAt: true },
      }),
    ]);

    const projectDfsSpent = dataforseoAgg._sum.costUsd ? Number(dataforseoAgg._sum.costUsd) : 0;
    const limit = project.spendLimitUsd ?? null;

    return NextResponse.json({
      monthLabel,
      year,
      month,
      isCurrentMonth,
      scope: "project",
      project: { id: project.id, name: project.name },
      dataforseo: {
        spentUsd: projectDfsSpent,
        limitUsd: limit,
        nearLimit: isCurrentMonth && limit !== null && projectDfsSpent >= limit * 0.8,
        blocked: isCurrentMonth && limit !== null && projectDfsSpent >= limit,
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

  const where = { createdAt: { gte: startOfMonth, lt: startOfNextMonth } };

  const [byEndpointRows, byProjectRows, totalAgg, dataforseoAgg] = await Promise.all([
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
    prisma.apiUsageLog.aggregate({ where: { ...where, api: "dataforseo" }, _sum: { costUsd: true } }),
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

  const dataforseoSpent = dataforseoAgg._sum.costUsd ? Number(dataforseoAgg._sum.costUsd) : 0;
  const limit = await getMonthlyLimitUsd();

  return NextResponse.json({
    monthLabel,
    year,
    month,
    isCurrentMonth,
    scope: "global",
    project: null,
    dataforseo: {
      spentUsd: dataforseoSpent,
      limitUsd: limit,
      nearLimit: isCurrentMonth && limit !== null && dataforseoSpent >= limit * 0.8,
      blocked: isCurrentMonth && limit !== null && dataforseoSpent >= limit,
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
