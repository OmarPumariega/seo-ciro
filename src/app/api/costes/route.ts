import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";
import { getMonthSpendUsd, getMonthlyLimitUsd } from "@/lib/dataforseo/spend";

// Panel de costes (sección 5 del spec): consumo acumulado del mes por API,
// endpoint y proyecto. Cubre TODA la actividad de API de pago registrada en
// ApiUsageLog (DataForSEO + OpenRouter), no solo DataForSEO.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
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
    monthLabel: startOfMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
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
  });
}
