"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Gauge, Target, Search, MapPin, Wallet, ClipboardCheck, Network } from "lucide-react";
import PrintButton from "./PrintButton";
import { splitManualTask } from "@/lib/tasks";
import { ISSUE_META } from "@/lib/audit/issue-meta";

// Secciones que el informe puede mostrar u ocultar. Mismo contrato que la API
// (src/app/api/proyectos/[id]/informe/config/route.ts) y que Project.reportConfig.
export type ReportSections = {
  audit: boolean;
  rank: boolean;
  keywords: boolean;
  geogrid: boolean;
  costs: boolean;
  tasks: boolean;
  links: boolean;
  competitors: boolean;
};

// categoryScores tal cual lo genera src/lib/audit/scoring.ts (Json en BD).
type CategoryScore = { score: number; max: number; detail: Record<string, number> };
export type CategoryScores = {
  indexabilidad: CategoryScore;
  enlaces: CategoryScore;
  onpage: CategoryScore;
  rendimiento: CategoryScore | null;
  accesibilidadImagenes: CategoryScore;
};

export type TopKeyword = { keyword: string; position: number | null; volume: number | null };

export type ReportData = {
  project: {
    name: string;
    domain: string | null;
    isLocalBusiness: boolean;
  };
  monthLabel: string;
  generationDate: string;
  isCurrentMonth: boolean;
  prevHref: string;
  nextHref: string | null;
  tasks: {
    id: string;
    text: string;
    issueType: string | null;
    affectedUrls: string[];
    completedAt: Date | null;
  }[];
  audit: {
    overallScore: number | null;
    categoryScores: CategoryScores | null;
    pagesCrawled: number;
    completedAt: Date | null;
  } | null;
  rank: {
    keywords: {
      keyword: string;
      device: string;
      lastPosition: number | null;
      bestPosition: number | null;
      lastCheckedAt: Date | null;
    }[];
    topRank: {
      keyword: string;
      device: string;
      lastPosition: number | null;
      bestPosition: number | null;
      lastCheckedAt: Date | null;
    }[];
    rankedCount: number;
  };
  keywords: { studyCount: number; keywordTotal: number };
  geogrid: {
    keyword: string;
    gridSize: number;
    foundCount: number | null;
    averagePosition: number | null;
    completedAt: Date | null;
  } | null;
  costs: { monthCost: number };
  links: {
    pages: { url: string; pagerank: number; incoming: number; outgoing: number }[];
    orphans: string[];
    topHubs: string[];
    auditDate: Date | null;
  } | null;
  competitors: {
    domain: string;
    organicTraffic: number | null;
    organicKeywords: number | null;
    topKeywords: TopKeyword[] | null;
    fetchedAt: Date | null;
  }[];
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

function fmtDate(d: Date | null): string {
  return d
    ? new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

function fmtTraffic(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
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

type Props = {
  projectId: string;
  data: ReportData;
  initialConfig: ReportSections;
};

export default function InformeBuilder({ projectId, data, initialConfig }: Props) {
  const [config, setConfig] = useState<ReportSections>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(key: keyof ReportSections) {
    setConfig((c) => ({ ...c, [key]: !c[key] }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/proyectos/${projectId}/informe/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: config }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  const CHECKBOXES: { key: keyof ReportSections; label: string }[] = [
    { key: "tasks", label: "Trabajos realizados" },
    { key: "audit", label: "Salud técnica (auditoría)" },
    { key: "rank", label: "Posicionamiento" },
    { key: "keywords", label: "Keywords" },
    { key: "geogrid", label: "SEO Local (geogrid)" },
    { key: "links", label: "Enlaces internos" },
    { key: "competitors", label: "Competidores" },
    { key: "costs", label: "Costes" },
  ];

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

      <div className="flex flex-col gap-4 mb-4 print:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
            <Link
              href={data.prevHref}
              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-md"
              title="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="text-sm font-medium text-gray-900 px-2 min-w-[9rem] text-center">
              {data.monthLabel}
            </span>
            {data.nextHref === null ? (
              <span className="p-1.5 text-gray-300">
                <ChevronRight className="h-4 w-4" />
              </span>
            ) : (
              <Link
                href={data.nextHref}
                className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-md"
                title="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          <PrintButton />
        </div>

        {/* Panel de control: checklist de secciones + guardar config */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Secciones del informe</h3>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-xs text-emerald-600">Configuración guardada</span>
              )}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar configuración"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CHECKBOXES.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={config[key]}
                  onChange={() => toggle(key)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Hoja del informe — solo se renderizan las secciones activadas */}
      <div className="bg-white rounded-xl border border-gray-200 px-8 py-10 space-y-8 print:border-0 print:rounded-none print:px-0 print:py-0">
        {/* Cabecera */}
        <div className="border-b border-gray-200 pb-5">
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <FileText className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide font-medium">Informe SEO</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{data.project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            {data.project.domain && <span>{data.project.domain}</span>}
            <span>Periodo: {data.monthLabel}</span>
            <span>Generado el {data.generationDate}</span>
          </div>
        </div>

        {config.tasks && (
          <section className="space-y-4">
            <SectionTitle icon={<ClipboardCheck className="h-4 w-4" />}>
              Trabajos realizados{" "}
              <span className="text-gray-400 font-normal text-sm">({data.monthLabel})</span>
            </SectionTitle>
            {data.tasks.length === 0 ? (
              <p className="text-sm text-gray-500">Sin tareas completadas registradas este mes.</p>
            ) : (
              <ul className="space-y-2">
                {data.tasks.map((t) => {
                  const label = t.issueType
                    ? ISSUE_META[t.issueType]?.label ?? t.issueType
                    : splitManualTask(t.text).title;
                  const sub = t.issueType
                    ? `${t.affectedUrls.length} página${t.affectedUrls.length === 1 ? "" : "s"} corregida${t.affectedUrls.length === 1 ? "" : "s"}`
                    : null;
                  return (
                    <li
                      key={t.id}
                      className="flex items-start justify-between gap-3 text-sm border-b border-gray-100 pb-2 last:border-0"
                    >
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
        )}

        {config.audit && (
          <section className="space-y-4">
            <SectionTitle icon={<Gauge className="h-4 w-4" />}>
              Salud técnica <span className="text-gray-400 font-normal text-sm">(Auditoría)</span>
            </SectionTitle>
            {!data.audit || data.audit.overallScore == null ? (
              <p className="text-sm text-gray-500">Sin auditorías completadas hasta este mes.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                  <div className="break-inside-avoid">
                    <div
                      className={`text-3xl font-bold tabular-nums print:text-black ${scoreTone(
                        data.audit.overallScore
                      )}`}
                    >
                      {data.audit.overallScore}
                      <span className="text-base font-medium text-gray-400">/100</span>
                    </div>
                    <div className="text-xs text-gray-500">Puntuación global</div>
                  </div>
                  {CATEGORY_LABELS.map(({ key, label }) => {
                    const cat = data.audit!.categoryScores?.[key];
                    return (
                      <Stat
                        key={key}
                        label={label}
                        value={cat ? `${cat.score}/${cat.max}` : "—"}
                        sub={key === "rendimiento" && !cat ? "sin dato PSI" : undefined}
                      />
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400">
                  {data.audit.pagesCrawled} página
                  {data.audit.pagesCrawled === 1 ? "" : "s"} rastreada
                  {data.audit.pagesCrawled === 1 ? "" : "s"} · Auditoría completada el{" "}
                  {fmtDate(data.audit.completedAt)}
                </p>
              </>
            )}
          </section>
        )}

        {config.rank && (
          <section className="space-y-4">
            <SectionTitle icon={<Target className="h-4 w-4" />}>
              Posicionamiento{" "}
              <span className="text-gray-400 font-normal text-sm">
                (Rank tracking, estado actual)
              </span>
            </SectionTitle>
            {data.rank.keywords.length === 0 ? (
              <p className="text-sm text-gray-500">Sin keywords en seguimiento.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Stat label="Keywords en seguimiento" value={String(data.rank.keywords.length)} />
                  <Stat
                    label="Con posición registrada"
                    value={String(data.rank.rankedCount)}
                    sub={`de ${data.rank.keywords.length} totales`}
                  />
                  <Stat
                    label="Mejor posición media"
                    value={
                      data.rank.rankedCount > 0
                        ? (
                            data.rank.keywords
                              .filter((k) => k.bestPosition != null)
                              .reduce((s, k) => s + (k.bestPosition as number), 0) /
                            Math.max(
                              1,
                              data.rank.keywords.filter((k) => k.bestPosition != null).length
                            )
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
                      {data.rank.topRank.map((k, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 pr-4 text-gray-900">{k.keyword}</td>
                          <td className="py-2 pr-4 text-gray-500">
                            {k.device === "mobile" ? "Móvil" : "Escritorio"}
                          </td>
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
                  {data.rank.keywords.length > 10 && (
                    <p className="text-xs text-gray-400 mt-2">
                      Mostrando las 10 mejores de {data.rank.keywords.length} keywords.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {config.keywords && (
          <section className="space-y-4">
            <SectionTitle icon={<Search className="h-4 w-4" />}>
              Investigación de keywords{" "}
              <span className="text-gray-400 font-normal text-sm">(Estudios, estado actual)</span>
            </SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Estudios guardados" value={String(data.keywords.studyCount)} />
              <Stat label="Keywords investigadas" value={String(data.keywords.keywordTotal)} />
            </div>
            {data.keywords.studyCount === 0 && (
              <p className="text-sm text-gray-500">
                Aún no hay estudios de keywords para este proyecto.
              </p>
            )}
          </section>
        )}

        {config.geogrid && data.project.isLocalBusiness && (
          <section className="space-y-4">
            <SectionTitle icon={<MapPin className="h-4 w-4" />}>
              SEO Local <span className="text-gray-400 font-normal text-sm">(Geogrid)</span>
            </SectionTitle>
            {!data.geogrid || data.geogrid.foundCount == null ? (
              <p className="text-sm text-gray-500">Sin geogrids completados hasta este mes.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Stat
                    label="Visibilidad"
                    value={`${data.geogrid.foundCount}/${data.geogrid.gridSize * data.geogrid.gridSize}`}
                    sub="puntos donde aparece"
                  />
                  <Stat
                    label="Posición media"
                    value={
                      data.geogrid.averagePosition != null
                        ? data.geogrid.averagePosition.toFixed(1)
                        : "—"
                    }
                  />
                  <Stat
                    label="Rejilla"
                    value={`${data.geogrid.gridSize}×${data.geogrid.gridSize}`}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  «{data.geogrid.keyword}» · Geogrid completado el{" "}
                  {fmtDate(data.geogrid.completedAt)}
                </p>
              </>
            )}
          </section>
        )}

        {config.links && (
          <section className="space-y-4">
            <SectionTitle icon={<Network className="h-4 w-4" />}>
              Enlaces internos{" "}
              <span className="text-gray-400 font-normal text-sm">
                (PageRank, última auditoría)
              </span>
            </SectionTitle>
            {!data.links || data.links.pages.length === 0 ? (
              <p className="text-sm text-gray-500">
                Sin grafo de enlaces disponible. Ejecuta una auditoría para analizar el enlazado
                interno.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Stat
                    label="URLs analizadas"
                    value={String(data.links.pages.length)}
                    sub={`auditoría del ${fmtDate(data.links.auditDate)}`}
                  />
                  <Stat
                    label="Páginas huérfanas"
                    value={String(data.links.orphans.length)}
                    sub="sin enlaces entrantes"
                  />
                  <Stat
                    label="Top distribuidora"
                    value={
                      data.links.topHubs[0]
                        ? (() => {
                            try {
                              return new URL(data.links.topHubs[0]).pathname || "/";
                            } catch {
                              return data.links.topHubs[0];
                            }
                          })()
                        : "—"
                    }
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-200">
                        <th className="py-2 pr-4 font-medium">URL</th>
                        <th className="py-2 pr-4 font-medium text-right">PageRank</th>
                        <th className="py-2 pr-4 font-medium text-right">Entrantes</th>
                        <th className="py-2 pr-4 font-medium text-right">Salientes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.links.pages.slice(0, 10).map((p) => (
                        <tr key={p.url} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 pr-4 text-gray-900 max-w-[320px] truncate">
                            {p.url}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-gray-900">
                            {(p.pagerank * 100).toFixed(2)}%
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-gray-500">
                            {p.incoming}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums text-gray-500">
                            {p.outgoing}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.links.pages.length > 10 && (
                    <p className="text-xs text-gray-400 mt-2">
                      Mostrando las 10 principales de {data.links.pages.length} URLs.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {config.competitors && (
          <section className="space-y-4">
            <SectionTitle icon={<Target className="h-4 w-4" />}>
              Competidores{" "}
              <span className="text-gray-400 font-normal text-sm">
                (Visibilidad, último análisis)
              </span>
            </SectionTitle>
            {data.competitors.length === 0 ? (
              <p className="text-sm text-gray-500">Sin competidores trackeados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-200">
                      <th className="py-2 pr-4 font-medium">Dominio</th>
                      <th className="py-2 pr-4 font-medium text-right">Tráfico orgánico</th>
                      <th className="py-2 pr-4 font-medium text-right">Keywords</th>
                      <th className="py-2 pr-4 font-medium">Análisis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.competitors.map((c) => (
                      <tr key={c.domain} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-gray-900">{c.domain}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-gray-900">
                          {fmtTraffic(c.organicTraffic)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-gray-500">
                          {c.organicKeywords?.toLocaleString("es-ES") ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-gray-400">{fmtDate(c.fetchedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {config.costs && (
          <section className="space-y-4">
            <SectionTitle icon={<Wallet className="h-4 w-4" />}>
              Coste del mes <span className="text-gray-400 font-normal text-sm">({data.monthLabel})</span>
            </SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat
                label="Gasto en APIs"
                value={`${data.costs.monthCost.toFixed(2)}$`}
                sub="DataForSEO + OpenRouter"
              />
            </div>
          </section>
        )}

        <footer className="border-t border-gray-200 pt-4 text-xs text-gray-400 print:text-black">
          Informe generado por SEO Ciro · Agencia Ciro · Sentido Común Internet SL
          {!data.isCurrentMonth &&
            " · Informe de un mes anterior — los datos de estado (salud técnica, SEO local) reflejan la última medición hasta el fin de ese mes."}
        </footer>
      </div>
    </div>
  );
}
