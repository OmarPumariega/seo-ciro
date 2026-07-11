import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { getMonthSpendUsd, getMonthlyLimitUsd } from "@/lib/dataforseo/spend";
import {
  FolderKanban,
  Wallet,
  Gauge,
  Target,
  ListChecks,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

const ENDPOINT_LABELS: Record<string, string> = {
  "modulo1.keywords.volumen": "M1 · Volumen de keywords",
  "modulo1.keywords.intencion": "M1 · Intención de keywords",
  "modulo1.estructura": "M1 · Estructura de URLs (IA)",
  "modulo3.titulos-meta": "M3 · Títulos y meta (IA)",
  "modulo4.schema.article": "M4 · Schema Article (IA)",
  "modulo4.schema.faq": "M4 · Schema FAQ (IA)",
  "modulo7.contenido": "M7 · Contenido (IA)",
  "modulo5.rankcheck": "M5 · Rank tracking",
  "modulo9.geogrid": "M9 · Geogrid",
};

function scoreTone(score: number | null | undefined): string {
  if (score == null) return "text-gray-400";
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

export default async function DashboardPage() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const recentWindow = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    projects,
    totalKeywordCount,
    studyCount,
    monthTotalAgg,
    dfsSpent,
    dfsLimit,
    failedAudits,
    latestCompletedAudits,
    latestGeogrids,
    monthCostRows,
    endpointRows,
    rankKeywords,
  ] = await Promise.all([
    prisma.project.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, domain: true, isLocalBusiness: true },
    }),
    prisma.rankKeyword.count(),
    prisma.keywordStudy.count(),
    prisma.apiUsageLog.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { costUsd: true },
    }),
    getMonthSpendUsd(),
    getMonthlyLimitUsd(),
    // Auditorías fallidas recientes (últimos 30 días).
    prisma.auditRun.findMany({
      where: { status: "failed", triggeredAt: { gte: recentWindow } },
      orderBy: { triggeredAt: "desc" },
      select: { id: true, projectId: true, errorMessage: true },
      take: 10,
    }),
    // Todas las auditorías completadas con nota, ordenadas para deducir la
    // más reciente por proyecto (take generoso, acotado para no crecer infinito).
    prisma.auditRun.findMany({
      where: { status: "completed", overallScore: { not: null } },
      orderBy: { triggeredAt: "desc" },
      select: { id: true, projectId: true, overallScore: true },
      take: 500,
    }),
    prisma.geogridRun.findMany({
      where: { status: "completed" },
      orderBy: { triggeredAt: "desc" },
      select: { id: true, projectId: true, foundCount: true, gridSize: true, averagePosition: true },
      take: 500,
    }),
    prisma.apiUsageLog.groupBy({
      by: ["projectId"],
      where: { createdAt: { gte: startOfMonth } },
      _sum: { costUsd: true },
    }),
    prisma.apiUsageLog.groupBy({
      by: ["api", "endpoint"],
      where: { createdAt: { gte: startOfMonth } },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.rankKeyword.findMany({
      select: { id: true, projectId: true, keyword: true },
    }),
  ]);

  // Tendencia de rank por keyword: comparamos las 2 últimas posiciones de los
  // últimos 90 días (suficiente para cualquier frecuencia diaria/semanal/mensual).
  const keywordIds = rankKeywords.map((k) => k.id);
  const positions =
    keywordIds.length > 0
      ? await prisma.rankPosition.findMany({
          where: { rankKeywordId: { in: keywordIds }, checkedAt: { gte: ninetyDaysAgo } },
          orderBy: { checkedAt: "desc" },
          select: { rankKeywordId: true, position: true },
        })
      : [];

  // Nos quedamos con las 2 posiciones más recientes por keyword (ya vienen
  // ordenadas desc por checkedAt).
  const posByKeyword = new Map<string, (number | null)[]>();
  for (const p of positions) {
    let arr = posByKeyword.get(p.rankKeywordId);
    if (!arr) {
      arr = [];
      posByKeyword.set(p.rankKeywordId, arr);
    }
    if (arr.length < 2) arr.push(p.position);
  }

  const trendByProject = new Map<string, { up: number; down: number }>();
  const bigDrops: { projectId: string; keyword: string; delta: number }[] = [];
  for (const k of rankKeywords) {
    const arr = posByKeyword.get(k.id);
    if (!arr || arr.length < 2 || arr[0] == null || arr[1] == null) continue;
    const latest = arr[0] as number;
    const prev = arr[1] as number;
    const tally = trendByProject.get(k.projectId) ?? { up: 0, down: 0 };
    if (latest < prev) tally.up++;
    else if (latest > prev) {
      tally.down++;
      const delta = latest - prev;
      if (delta >= 10) bigDrops.push({ projectId: k.projectId, keyword: k.keyword, delta });
    }
    trendByProject.set(k.projectId, tally);
  }

  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const latestAuditByProject = new Map<string, number | null>();
  for (const a of latestCompletedAudits) {
    if (!latestAuditByProject.has(a.projectId)) latestAuditByProject.set(a.projectId, a.overallScore);
  }

  const latestGeogridByProject = new Map<
    string,
    { foundCount: number | null; gridSize: number; averagePosition: number | null }
  >();
  for (const g of latestGeogrids) {
    if (!latestGeogridByProject.has(g.projectId)) {
      latestGeogridByProject.set(g.projectId, {
        foundCount: g.foundCount,
        gridSize: g.gridSize,
        averagePosition: g.averagePosition,
      });
    }
  }

  const monthCostByProject = new Map<string, number>();
  for (const r of monthCostRows) {
    if (r.projectId) monthCostByProject.set(r.projectId, r._sum.costUsd ? Number(r._sum.costUsd) : 0);
  }

  const monthTotal = monthTotalAgg._sum.costUsd ? Number(monthTotalAgg._sum.costUsd) : 0;
  const monthLabel = startOfMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const dfsPct = dfsLimit !== null ? (dfsSpent / dfsLimit) * 100 : null;
  const projectsWithoutDomain = projects.filter((p) => !p.domain);

  type Alert = { tone: "danger" | "warning"; text: string; href?: string };
  const alerts: Alert[] = [];

  // Lo más importante primero: tope superado (rojo), cerca del tope (ámbar).
  if (dfsLimit !== null && dfsSpent >= dfsLimit) {
    alerts.push({
      tone: "danger",
      text: `Tope mensual de DataForSEO superado: ${dfsSpent.toFixed(2)}$ de ${dfsLimit.toFixed(2)}$.`,
      href: "/admin/costes",
    });
  } else if (dfsLimit !== null && dfsSpent >= dfsLimit * 0.8) {
    alerts.push({
      tone: "warning",
      text: `Cerca del tope mensual de DataForSEO: ${dfsPct!.toFixed(0)}% (${dfsSpent.toFixed(2)}$ de ${dfsLimit.toFixed(2)}$).`,
      href: "/admin/costes",
    });
  }

  for (const fa of failedAudits) {
    alerts.push({
      tone: "danger",
      text: `Auditoría fallida en ${projectName.get(fa.projectId) ?? "proyecto eliminado"}${fa.errorMessage ? ` — ${fa.errorMessage}` : ""}.`,
      href: `/admin/proyectos/${fa.projectId}/auditoria`,
    });
  }

  if (projectsWithoutDomain.length > 0) {
    alerts.push({
      tone: "warning",
      text:
        projectsWithoutDomain.length === 1
          ? `${projectsWithoutDomain[0].name} no tiene dominio configurado.`
          : `${projectsWithoutDomain.length} proyectos sin dominio configurado.`,
      href:
        projectsWithoutDomain.length === 1
          ? `/admin/proyectos/${projectsWithoutDomain[0].id}`
          : "/admin/proyectos",
    });
  }

  for (const d of bigDrops.slice(0, 5)) {
    alerts.push({
      tone: "warning",
      text: `«${d.keyword}» ha caído ${d.delta} posiciones en ${projectName.get(d.projectId) ?? "proyecto"}.`,
      href: `/admin/proyectos/${d.projectId}/rank`,
    });
  }

  const topEndpoints = endpointRows
    .map((r) => ({
      endpoint: r.endpoint,
      cost: r._sum.costUsd ? Number(r._sum.costUsd) : 0,
      count: r._count,
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Panel general</h1>
        <p className="text-sm text-gray-500 mt-1">
          Resumen de la actividad de la agencia: proyectos, costes, posicionamiento y avisos.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          icon={<FolderKanban className="h-5 w-5 text-gray-500" />}
          label="Proyectos"
          value={String(projects.length)}
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5 text-gray-500" />}
          label={`Coste del mes · ${monthLabel}`}
          value={`${monthTotal.toFixed(2)}$`}
        />
        <KpiCard
          icon={
            <Gauge
              className={
                dfsLimit !== null && dfsSpent >= dfsLimit
                  ? "h-5 w-5 text-red-500"
                  : dfsLimit !== null && dfsSpent >= dfsLimit * 0.8
                    ? "h-5 w-5 text-amber-500"
                    : "h-5 w-5 text-gray-500"
              }
            />
          }
          label="DataForSEO (mes)"
          value={`${dfsSpent.toFixed(2)}$`}
          sub={dfsLimit !== null ? `/ ${dfsLimit.toFixed(2)}$ configurados` : "sin tope"}
        />
        <KpiCard
          icon={<Target className="h-5 w-5 text-gray-500" />}
          label="Keywords en seguimiento"
          value={String(totalKeywordCount)}
        />
        <KpiCard
          icon={<ListChecks className="h-5 w-5 text-gray-500" />}
          label="Estudios de keywords"
          value={String(studyCount)}
        />
      </div>

      {/* Avisos */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Avisos</h2>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Todo en orden.
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i}>
                <Link href={a.href ?? "#"} className="flex items-start gap-2 text-sm group">
                  <AlertTriangle
                    className={
                      a.tone === "danger"
                        ? "h-4 w-4 text-red-500 mt-0.5 shrink-0"
                        : "h-4 w-4 text-amber-500 mt-0.5 shrink-0"
                    }
                  />
                  <span className={a.tone === "danger" ? "text-red-700" : "text-amber-700"}>{a.text}</span>
                  {a.href && (
                    <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 mt-0.5 shrink-0" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tabla de proyectos */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Salud de los proyectos</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aún no hay proyectos.{" "}
            <Link href="/admin/proyectos" className="text-gray-900 underline underline-offset-2">
              Crear el primero
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-4 font-medium">Proyecto</th>
                  <th className="py-2 pr-4 font-medium">Nota auditoría</th>
                  <th className="py-2 pr-4 font-medium">Tendencia rank</th>
                  <th className="py-2 pr-4 font-medium">Último geogrid</th>
                  <th className="py-2 pr-4 font-medium text-right">Coste mes</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const score = latestAuditByProject.get(p.id) ?? null;
                  const trend = trendByProject.get(p.id);
                  const geo = latestGeogridByProject.get(p.id);
                  const cost = monthCostByProject.get(p.id) ?? 0;
                  const trendTotal = trend ? trend.up + trend.down : 0;
                  return (
                    <tr key={p.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-4">
                        <Link href={`/admin/proyectos/${p.id}`} className="text-gray-900 hover:underline">
                          {p.name}
                        </Link>
                        {p.domain ? (
                          <span className="block text-xs text-gray-400">{p.domain}</span>
                        ) : (
                          <span className="block text-xs text-amber-600">sin dominio</span>
                        )}
                      </td>
                      <td className={`py-2.5 pr-4 font-medium ${scoreTone(score)}`}>
                        {score == null ? "—" : `${score}/100`}
                      </td>
                      <td className="py-2.5 pr-4">
                        {trend && trendTotal > 0 ? (
                          <span className="flex items-center gap-3">
                            {trend.up > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-emerald-600">
                                <TrendingUp className="h-3.5 w-3.5" />
                                {trend.up}
                              </span>
                            )}
                            {trend.down > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-red-600">
                                <TrendingDown className="h-3.5 w-3.5" />
                                {trend.down}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600">
                        {geo ? (
                          <span>
                            {geo.foundCount ?? 0}/{geo.gridSize * geo.gridSize}
                            {geo.averagePosition != null && (
                              <span className="text-gray-400"> · {geo.averagePosition.toFixed(1)}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-900 tabular-nums">
                        {cost > 0 ? `${cost.toFixed(2)}$` : <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resumen de costes */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Costes del mes</h2>
          <Link
            href="/admin/costes"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
          >
            Ver detalle <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {topEndpoints.length === 0 ? (
          <p className="text-sm text-gray-500">Sin consumo este mes.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {topEndpoints.map((r) => (
                <tr key={r.endpoint} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-gray-700">
                    {ENDPOINT_LABELS[r.endpoint] ?? r.endpoint}
                    <span className="text-xs text-gray-400 ml-1">
                      · {r.count} {r.count === 1 ? "llamada" : "llamadas"}
                    </span>
                  </td>
                  <td className="py-2 text-right text-gray-900 tabular-nums">{r.cost.toFixed(3)}$</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="mb-2">{icon}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
