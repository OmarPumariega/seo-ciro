import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import PrintButton from "./PrintButton";
import { splitManualTask } from "@/lib/tasks";
import { ISSUE_META } from "@/lib/audit/issue-meta";
import { Gauge, Target, Search, MapPin, Wallet, FileText, ClipboardCheck, ChevronLeft, ChevronRight } from "lucide-react";

// Estructura del JSON categoryScores que genera src/lib/audit/scoring.ts.
type CategoryScore = { score: number; max: number; detail: Record<string, number> };
type CategoryScores = {
  indexabilidad: CategoryScore;
  enlaces: CategoryScore;
  onpage: CategoryScore;
  rendimiento: CategoryScore | null;
  accesibilidadImagenes: CategoryScore;
};

const CATEGORY_LABELS: { key: keyof CategoryScores; label: string }[] = [
  { key: "indexabilidad", label: "Indexabilidad" },
  { key: "enlaces", label: "Enlaces" },
  { key: "onpage", label: "On-page" },
  { key: "rendimiento", label: "Rendimiento" },
  { key: "accesibilidadImagenes", label: "Accesibilidad imágenes" },
];

function scoreTone(score: number | null): string {
  if (score == null) return "text-gray-400";
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function SectionTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-4">
      <span className="text-gray-400 print:text-black">{icon}</span>
      {children}
    </h2>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="break-inside-avoid">
      <div className="text-xl font-semibold text-gray-900 tabular-nums print:text-black">
        {value}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function InformePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      domain: true,
      isLocalBusiness: true,
      businessName: true,
      address: true,
    },
  });
  if (!project) notFound();

  const now = new Date();
  const rawYear = Number(sp.year);
  const rawMonth = Number(sp.month); // 1-12
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 3000 ? rawYear : now.getFullYear();
  const month = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : now.getMonth() + 1;
  const startOfMonth = new Date(year, month - 1, 1);
  const startOfNextMonth = new Date(year, month, 1);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  function monthHref(y: number, m: number): string {
    return `/admin/proyectos/${id}/informe?year=${y}&month=${m}`;
  }
  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const nextDisabled = nextMonth.y > now.getFullYear() || (nextMonth.y === now.getFullYear() && nextMonth.m > now.getMonth() + 1);

  const [latestAudit, rankKeywords, studyCount, keywordTotal, monthCostAgg, latestGeogrid, completedTodos] =
    await Promise.all([
      // Estado "a fecha de fin de ese mes": la auditoría más reciente completada
      // hasta ese momento, no siempre la más reciente de hoy — así un informe de
      // un mes pasado no filtra datos de después de ese mes.
      prisma.auditRun.findFirst({
        where: { projectId: id, status: "completed", completedAt: { lt: startOfNextMonth } },
        orderBy: { completedAt: "desc" },
        select: {
          overallScore: true,
          categoryScores: true,
          pagesCrawled: true,
          completedAt: true,
        },
      }),
      prisma.rankKeyword.findMany({
        where: { projectId: id },
        select: {
          keyword: true,
          device: true,
          lastPosition: true,
          bestPosition: true,
          lastCheckedAt: true,
        },
      }),
      prisma.keywordStudy.count({ where: { projectId: id } }),
      prisma.keyword.count({ where: { study: { projectId: id } } }),
      prisma.apiUsageLog.aggregate({
        where: { projectId: id, createdAt: { gte: startOfMonth, lt: startOfNextMonth } },
        _sum: { costUsd: true },
      }),
      prisma.geogridRun.findFirst({
        where: { projectId: id, status: "completed", completedAt: { lt: startOfNextMonth } },
        orderBy: { completedAt: "desc" },
        select: {
          keyword: true,
          gridSize: true,
          foundCount: true,
          averagePosition: true,
          completedAt: true,
        },
      }),
      // Trabajos Realizados: tareas (manuales o auto-generadas desde
      // auditoría) completadas de verdad dentro de ese mes natural.
      prisma.todoItem.findMany({
        where: { projectId: id, done: true, completedAt: { gte: startOfMonth, lt: startOfNextMonth } },
        orderBy: { completedAt: "desc" },
        select: { id: true, text: true, issueType: true, affectedUrls: true, completedAt: true },
      }),
    ]);

  const monthCost = monthCostAgg._sum.costUsd ? Number(monthCostAgg._sum.costUsd) : 0;
  const cats = (latestAudit?.categoryScores ?? null) as CategoryScores | null;

  // Top 10 keywords por mejor posición (ascendente; nulls al final).
  const topRank = [...rankKeywords]
    .sort((a, b) => {
      if (a.bestPosition == null && b.bestPosition == null) return 0;
      if (a.bestPosition == null) return 1;
      if (b.bestPosition == null) return -1;
      return a.bestPosition - b.bestPosition;
    })
    .slice(0, 10);

  const rankedCount = rankKeywords.filter((k) => k.lastPosition != null).length;
  const generationDate = now.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // toLocaleDateString da "julio de 2026"; se capitaliza solo la primera
  // letra (la clase Tailwind "capitalize" pone mayúscula en CADA palabra,
  // "Julio De 2026").
  const monthLabel = capitalizeFirst(
    startOfMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" })
  );

  const fmtDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const deviceLabel = (d: string) => (d === "mobile" ? "Móvil" : "Escritorio");

  return (
    <div className="max-w-4xl mx-auto">
      {/* CSS de impresión: oculta el cromado de la app (sidebar, cabecera,
          pestañas) y deja que el documento ocupe la página con márgenes. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            @page { margin: 1.5cm; }
            html, body {
              height: auto !important;
              overflow: visible !important;
              background: #fff !important;
            }
            aside, header, nav { display: none !important; }
            main { overflow: visible !important; height: auto !important; padding: 0 !important; }
            section { break-inside: avoid; }
            tr { break-inside: avoid; }
          }
          `,
        }}
      />

      {/* Barra de acciones (no imprime) */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
          <Link
            href={monthHref(prevMonth.y, prevMonth.m)}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-md"
            title="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-medium text-gray-900 px-2 min-w-[9rem] text-center">
            {monthLabel}
          </span>
          {nextDisabled ? (
            <span className="p-1.5 text-gray-300">
              <ChevronRight className="h-4 w-4" />
            </span>
          ) : (
            <Link
              href={monthHref(nextMonth.y, nextMonth.m)}
              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-md"
              title="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        <PrintButton />
      </div>

      {/* Hoja del informe */}
      <div className="bg-white rounded-xl border border-gray-200 px-8 py-10 space-y-8 print:border-0 print:rounded-none print:px-0 print:py-0">

        {/* Cabecera */}
        <div className="border-b border-gray-200 pb-5">
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <FileText className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide font-medium">Informe SEO</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            {project.domain && <span>{project.domain}</span>}
            <span>Periodo: {monthLabel}</span>
            <span>Generado el {generationDate}</span>
          </div>
        </div>

        {/* Trabajos realizados este mes — lo primero que ve el cliente: qué se
            hizo, no solo cómo está la web. Incluye tareas manuales y las
            auto-generadas desde hallazgos de auditoría, solo cuando quedaron
            genuinamente resueltas (ver generateAuditTasks). */}
        <section className="space-y-4">
          <SectionTitle icon={<ClipboardCheck className="h-4 w-4" />}>
            Trabajos realizados{" "}
            <span className="text-gray-400 font-normal text-sm">({monthLabel})</span>
          </SectionTitle>
          {completedTodos.length === 0 ? (
            <p className="text-sm text-gray-500">Sin tareas completadas registradas este mes.</p>
          ) : (
            <ul className="space-y-2">
              {completedTodos.map((t) => {
                const label = t.issueType
                  ? (ISSUE_META[t.issueType]?.label ?? t.issueType)
                  : splitManualTask(t.text).title;
                const sub = t.issueType
                  ? `${t.affectedUrls.length} página${t.affectedUrls.length === 1 ? "" : "s"} corregida${t.affectedUrls.length === 1 ? "" : "s"}`
                  : null;
                return (
                  <li key={t.id} className="flex items-start justify-between gap-3 text-sm border-b border-gray-100 pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="text-gray-900">{label}</p>
                      {sub && <p className="text-xs text-gray-400">{sub}</p>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                      {fmtDate(t.completedAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Salud técnica (Módulo 8) */}
        <section className="space-y-4">
          <SectionTitle icon={<Gauge className="h-4 w-4" />}>
            Salud técnica <span className="text-gray-400 font-normal text-sm">(Auditoría)</span>
          </SectionTitle>
          {!latestAudit || latestAudit.overallScore == null ? (
            <p className="text-sm text-gray-500">Sin auditorías completadas hasta este mes.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                <div className="break-inside-avoid">
                  <div
                    className={`text-3xl font-bold tabular-nums print:text-black ${scoreTone(
                      latestAudit.overallScore
                    )}`}
                  >
                    {latestAudit.overallScore}
                    <span className="text-base font-medium text-gray-400">/100</span>
                  </div>
                  <div className="text-xs text-gray-500">Puntuación global</div>
                </div>
                {CATEGORY_LABELS.map(({ key, label }) => {
                  const cat = cats?.[key];
                  return (
                    <Stat
                      key={key}
                      label={label}
                      value={cat ? `${cat.score}/${cat.max}` : "—"}
                      sub={
                        key === "rendimiento" && !cat ? "sin dato PSI" : undefined
                      }
                    />
                  );
                })}
              </div>
              <p className="text-xs text-gray-400">
                {latestAudit.pagesCrawled} página{latestAudit.pagesCrawled === 1 ? "" : "s"} rastreada
                {latestAudit.pagesCrawled === 1 ? "" : "s"} · Auditoría completada el{" "}
                {fmtDate(latestAudit.completedAt)}
              </p>
            </>
          )}
        </section>

        {/* Posicionamiento (Módulo 5) */}
        <section className="space-y-4">
          <SectionTitle icon={<Target className="h-4 w-4" />}>
            Posicionamiento <span className="text-gray-400 font-normal text-sm">(Rank tracking, estado actual)</span>
          </SectionTitle>
          {rankKeywords.length === 0 ? (
            <p className="text-sm text-gray-500">Sin keywords en seguimiento.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Stat
                  label="Keywords en seguimiento"
                  value={String(rankKeywords.length)}
                />
                <Stat
                  label="Con posición registrada"
                  value={String(rankedCount)}
                  sub={`de ${rankKeywords.length} totales`}
                />
                <Stat
                  label="Mejor posición media"
                  value={
                    rankedCount > 0
                      ? (
                          rankKeywords
                            .filter((k) => k.bestPosition != null)
                            .reduce((s, k) => s + (k.bestPosition as number), 0) /
                          Math.max(1, rankKeywords.filter((k) => k.bestPosition != null).length)
                        ).toFixed(1)
                      : "—"
                  }
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-200">
                      <th className="py-2 pr-4 font-medium">Keyword</th>
                      <th className="py-2 pr-4 font-medium">Dispositivo</th>
                      <th className="py-2 pr-4 font-medium text-right">Última</th>
                      <th className="py-2 pr-4 font-medium text-right">Mejor</th>
                      <th className="py-2 pr-4 font-medium">Chequeo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRank.map((k, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-gray-900">{k.keyword}</td>
                        <td className="py-2 pr-4 text-gray-500">{deviceLabel(k.device)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-gray-900">
                          {k.lastPosition ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums font-medium text-gray-900">
                          {k.bestPosition ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-gray-400">{fmtDate(k.lastCheckedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rankKeywords.length > 10 && (
                  <p className="text-xs text-gray-400 mt-2">
                    Mostrando las 10 mejores de {rankKeywords.length} keywords.
                  </p>
                )}
              </div>
            </>
          )}
        </section>

        {/* Keywords (Módulo 1) */}
        <section className="space-y-4">
          <SectionTitle icon={<Search className="h-4 w-4" />}>
            Investigación de keywords{" "}
            <span className="text-gray-400 font-normal text-sm">(Estudios, estado actual)</span>
          </SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Estudios guardados" value={String(studyCount)} />
            <Stat label="Keywords investigadas" value={String(keywordTotal)} />
          </div>
          {studyCount === 0 && (
            <p className="text-sm text-gray-500">Aún no hay estudios de keywords para este proyecto.</p>
          )}
        </section>

        {/* Local (Módulo 9) */}
        {project.isLocalBusiness && (
          <section className="space-y-4">
            <SectionTitle icon={<MapPin className="h-4 w-4" />}>
              SEO Local <span className="text-gray-400 font-normal text-sm">(Geogrid)</span>
            </SectionTitle>
            {!latestGeogrid || latestGeogrid.foundCount == null ? (
              <p className="text-sm text-gray-500">Sin geogrids completados hasta este mes.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Stat
                    label="Visibilidad"
                    value={`${latestGeogrid.foundCount}/${latestGeogrid.gridSize * latestGeogrid.gridSize}`}
                    sub="puntos donde aparece"
                  />
                  <Stat
                    label="Posición media"
                    value={
                      latestGeogrid.averagePosition != null
                        ? latestGeogrid.averagePosition.toFixed(1)
                        : "—"
                    }
                  />
                  <Stat label="Rejilla" value={`${latestGeogrid.gridSize}×${latestGeogrid.gridSize}`} />
                </div>
                <p className="text-xs text-gray-400">
                  «{latestGeogrid.keyword}» · Geogrid completado el {fmtDate(latestGeogrid.completedAt)}
                </p>
              </>
            )}
          </section>
        )}

        {/* Coste del mes */}
        <section className="space-y-4">
          <SectionTitle icon={<Wallet className="h-4 w-4" />}>
            Coste del mes <span className="text-gray-400 font-normal text-sm">({monthLabel})</span>
          </SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Gasto en APIs" value={`${monthCost.toFixed(2)}$`} sub="DataForSEO + OpenRouter" />
          </div>
        </section>

        {/* Pie */}
        <footer className="border-t border-gray-200 pt-4 text-xs text-gray-400 print:text-black">
          Informe generado por SEO Ciro · Agencia Ciro · Sentido Común Internet SL
          {!isCurrentMonth && " · Informe de un mes anterior — los datos de estado (salud técnica, SEO local) reflejan la última medición hasta el fin de ese mes."}
        </footer>
      </div>
    </div>
  );
}
