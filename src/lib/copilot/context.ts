import { prisma } from "@/lib/db/prisma";

// Construye un resumen en texto plano de los datos REALES del proyecto para
// inyectarlo como contexto del system prompt del Copilot. Conciso (datos, no
// párrafos) — el LLM se encarga de redactar la respuesta final.
export async function buildProjectContext(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, domain: true },
  });
  if (!project) return "El proyecto no existe.";

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [latestAudit, rankKeywords, studyCount, monthCostAgg, gscSnapshot] = await Promise.all([
    prisma.auditRun.findFirst({
      where: { projectId, status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { overallScore: true, pagesCrawled: true, completedAt: true },
    }),
    prisma.rankKeyword.findMany({
      where: { projectId },
      select: {
        keyword: true,
        device: true,
        lastPosition: true,
        bestPosition: true,
      },
    }),
    prisma.keywordStudy.count({ where: { projectId } }),
    prisma.apiUsageLog.aggregate({
      where: { projectId, createdAt: { gte: startOfMonth } },
      _sum: { costUsd: true },
    }),
    prisma.gscSnapshot.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { month: true, rangeDays: true, totals: true, topQueries: true },
    }),
  ]);

  const monthCost = monthCostAgg._sum.costUsd ? Number(monthCostAgg._sum.costUsd) : 0;

  const hasData =
    latestAudit !== null || rankKeywords.length > 0 || studyCount > 0 || monthCost > 0 || gscSnapshot !== null;
  if (!hasData) return "El proyecto aún no tiene datos suficientes.";

  const lines: string[] = [];
  lines.push(`Proyecto: ${project.name}${project.domain ? ` (${project.domain})` : ""}`);

  if (latestAudit) {
    const fecha = latestAudit.completedAt
      ? new Date(latestAudit.completedAt).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";
    lines.push(
      `Última auditoría: puntuación ${latestAudit.overallScore ?? "—"}/100, ` +
        `${latestAudit.pagesCrawled} páginas rastreadas (${fecha}).`
    );
  }

  if (rankKeywords.length > 0) {
    const top = [...rankKeywords]
      .sort((a, b) => {
        if (a.bestPosition == null && b.bestPosition == null) return 0;
        if (a.bestPosition == null) return 1;
        if (b.bestPosition == null) return -1;
        return a.bestPosition - b.bestPosition;
      })
      .slice(0, 10);
    lines.push(
      `Keywords en seguimiento: ${rankKeywords.length} totales. Top 10 por mejor posición:`
    );
    for (const k of top) {
      const dev = k.device === "mobile" ? " (móvil)" : "";
      lines.push(
        `  - ${k.keyword}${dev}: última ${k.lastPosition ?? "—"}, mejor ${k.bestPosition ?? "—"}`
      );
    }
  }

  lines.push(`Estudios de keywords: ${studyCount}.`);
  lines.push(`Coste del mes (APIs): ${monthCost.toFixed(2)} USD.`);

  // Rendimiento real de Search Console (del snapshot persistido al abrir el
  // panel de GSC). Datos reales de tráfico, no estimados.
  if (gscSnapshot) {
    const totals = gscSnapshot.totals as {
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    };
    const qs = (gscSnapshot.topQueries as Array<{ query: string; clicks: number; position: number }> | null) ?? [];
    lines.push(
      `Search Console (snapshot ${gscSnapshot.month}, últimos ${gscSnapshot.rangeDays} días): ` +
        `${Math.round(totals.clicks)} clics, ${Math.round(totals.impressions)} impresiones, ` +
        `CTR ${(totals.ctr * 100).toFixed(1)}%, posición media ${totals.position.toFixed(1)}.`
    );
    if (qs.length > 0) {
      const topQ = qs
        .slice(0, 10)
        .map((q) => `${q.query} (${Math.round(q.clicks)} clics, pos. ${q.position.toFixed(1)})`)
        .join("; ");
      lines.push(`Top queries reales que traen tráfico: ${topQ}.`);
    }
  }

  return lines.join("\n");
}
