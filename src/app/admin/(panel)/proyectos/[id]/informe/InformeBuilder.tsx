"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, FileText, Gauge, Target, Search,
  MapPin, Wallet, ClipboardCheck, Network, Type, Code2, PenLine, Globe, GitBranch,
} from "lucide-react";
import GeogridMap from "@/components/admin/GeogridMap";
import PrintButton from "./PrintButton";
import { splitManualTask } from "@/lib/tasks";
import { ISSUE_META } from "@/lib/audit/issue-meta";
import {
  SECTION_LABELS,
  type ReportSections, type SectionKey,
} from "@/lib/informe/sections";

export type { ReportSections, SectionKey } from "@/lib/informe/sections";

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
  project: { name: string; domain: string | null; isLocalBusiness: boolean };
  monthLabel: string;
  generationDate: string;
  isCurrentMonth: boolean;
  prevHref: string;
  nextHref: string | null;
  tasks: { id: string; text: string; issueType: string | null; affectedUrls: string[]; completedAt: Date | null }[];
  audit: { overallScore: number | null; categoryScores: CategoryScores | null; pagesCrawled: number; completedAt: Date | null } | null;
  authority: { impressions: number; clicks: number; queries: number; position: number; month: string } | null;
  rank: {
    keywords: { keyword: string; device: string; lastPosition: number | null; bestPosition: number | null; lastCheckedAt: Date | null }[];
    topRank: { keyword: string; device: string; lastPosition: number | null; bestPosition: number | null; lastCheckedAt: Date | null }[];
    rankedCount: number;
  };
  keywords: { studyCount: number; keywordTotal: number };
  arquitectura: { pages: { slug: string; h1: string }[]; updatedAt: Date } | null;
  "titulos-meta": { url: string; variants: { title: string; description: string }[]; createdAt: Date }[];
  schema: { url: string; selectedType: string; valid: boolean; createdAt: Date }[];
  contenido: { topic: string; model: string | null; createdAt: Date }[];
  google: { month: string; rangeDays: number; totals: { clicks: number; impressions: number; ctr: number; position: number }; topQueries: { query: string; clicks: number; position: number }[] } | null;
  canibalizaciones: { count: number; top: { query: string; urls: number; clicks: number }[] } | null;
  geogrid: {
    keyword: string; gridSize: number; radiusKm: number; centerLat: number; centerLng: number;
    foundCount: number | null; averagePosition: number | null;
    points: { row: number; col: number; lat: number; lng: number; position: number | null }[] | null;
    completedAt: Date | null;
  } | null;
  costs: { monthCost: number };
  links: { pages: { url: string; pagerank: number; incoming: number; outgoing: number }[]; orphans: string[]; topHubs: string[]; auditDate: Date | null } | null;
  competitors: {
    own: { organicTraffic: number | null; organicKeywords: number | null; topKeywords: TopKeyword[] | null; fetchedAt: Date | null } | null;
    items: {
      domain: string;
      organicTraffic: number | null;
      organicKeywords: number | null;
      topKeywords: TopKeyword[] | null;
      contentGap: TopKeyword[] | null;
      contentGapAt: Date | null;
      fetchedAt: Date | null;
    }[];
  };
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
  return d ? new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
function fmtTraffic(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("es-ES");
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
      <div className="text-xl font-semibold text-gray-900 tabular-nums print:text-black">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

type Props = {
  projectId: string;
  data: ReportData;
  initialConfig: ReportSections;
  initialOrder: SectionKey[];
};

export default function InformeBuilder({ projectId, data, initialConfig, initialOrder }: Props) {
  const [config, setConfig] = useState<ReportSections>(initialConfig);
  const [order, setOrder] = useState<SectionKey[]>(initialOrder);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(key: SectionKey) {
    setConfig((c) => ({ ...c, [key]: !c[key] }));
    setSaved(false);
  }
  function move(key: SectionKey, dir: -1 | 1) {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/proyectos/${projectId}/informe/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: config, order }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  // --- Render de cada sección como función, despachada por orden ---
  const renderTasks = () => (
    <section className="space-y-4">
      <SectionTitle icon={<ClipboardCheck className="h-4 w-4" />}>
        Trabajos realizados <span className="text-gray-400 font-normal text-sm">({data.monthLabel})</span>
      </SectionTitle>
      {data.tasks.length === 0 ? (
        <p className="text-sm text-gray-500">Sin tareas completadas registradas este mes.</p>
      ) : (
        <ul className="space-y-2">
          {data.tasks.map((t) => {
            const label = t.issueType ? ISSUE_META[t.issueType]?.label ?? t.issueType : splitManualTask(t.text).title;
            const sub = t.issueType ? `${t.affectedUrls.length} página${t.affectedUrls.length === 1 ? "" : "s"} corregida${t.affectedUrls.length === 1 ? "" : "s"}` : null;
            return (
              <li key={t.id} className="flex items-start justify-between gap-3 text-sm border-b border-gray-100 pb-2 last:border-0">
                <div className="min-w-0"><p className="text-gray-900">{label}</p>{sub && <p className="text-xs text-gray-400">{sub}</p>}</div>
                <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{fmtDate(t.completedAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const renderAudit = () => (
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
              <div className={`text-3xl font-bold tabular-nums print:text-black ${scoreTone(data.audit.overallScore)}`}>
                {data.audit.overallScore}<span className="text-base font-medium text-gray-400">/100</span>
              </div>
              <div className="text-xs text-gray-500">Puntuación global</div>
            </div>
            {CATEGORY_LABELS.map(({ key, label }) => {
              const cat = data.audit!.categoryScores?.[key];
              return <Stat key={key} label={label} value={cat ? `${cat.score}/${cat.max}` : "—"} sub={key === "rendimiento" && !cat ? "sin dato PSI" : undefined} />;
            })}
          </div>
          <p className="text-xs text-gray-400">
            {data.audit.pagesCrawled} página{data.audit.pagesCrawled === 1 ? "" : "s"} rastreada{data.audit.pagesCrawled === 1 ? "" : "s"} · Auditoría completada el {fmtDate(data.audit.completedAt)}
          </p>

          {/* Core Web Vitals (PageSpeed Insights) */}
          {data.audit.categoryScores?.rendimiento?.detail && (() => {
            const d = data.audit.categoryScores!.rendimiento!.detail;
            const perf = d.performanceScorePct;
            const lcp = d.lcpMs;
            const clsX = d.clsX1000;
            const inp = d.inpMs;
            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <Stat label="Performance" value={perf >= 0 ? String(perf) : "—"} />
                  <Stat label="LCP" value={lcp >= 0 ? `${(lcp / 1000).toFixed(1)}s` : "—"} />
                  <Stat label="CLS" value={clsX >= 0 ? (clsX / 1000).toFixed(2) : "—"} />
                  <Stat label="INP" value={inp >= 0 ? `${inp}ms` : "—"} />
                </div>
                <p className="text-xs text-gray-400">Core Web Vitals sobre la home (móvil) · Google PageSpeed Insights.</p>
              </>
            );
          })()}

          {/* Visibilidad en Google (Search Console, gratis) */}
          {data.authority && (data.authority.impressions > 0 || data.authority.queries > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-gray-100">
              <Stat label={`Impresiones (${data.authority.month})`} value={fmtTraffic(data.authority.impressions)} />
              <Stat label={`Clics (${data.authority.month})`} value={fmtTraffic(data.authority.clicks)} />
              <Stat label="Queries con datos" value={data.authority.queries.toLocaleString("es-ES")} />
              <Stat label="Posición media" value={data.authority.position.toFixed(1)} />
            </div>
          )}
        </>
      )}
    </section>
  );

  const renderRank = () => (
    <section className="space-y-4">
      <SectionTitle icon={<Target className="h-4 w-4" />}>
        Posicionamiento <span className="text-gray-400 font-normal text-sm">(Rank tracking, estado actual)</span>
      </SectionTitle>
      {data.rank.keywords.length === 0 ? (
        <p className="text-sm text-gray-500">Sin keywords en seguimiento.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Keywords en seguimiento" value={String(data.rank.keywords.length)} />
            <Stat label="Con posición registrada" value={String(data.rank.rankedCount)} sub={`de ${data.rank.keywords.length} totales`} />
            <Stat label="Mejor posición media" value={data.rank.rankedCount > 0 ? (data.rank.keywords.filter((k) => k.bestPosition != null).reduce((s, k) => s + (k.bestPosition as number), 0) / Math.max(1, data.rank.keywords.filter((k) => k.bestPosition != null).length)).toFixed(1) : "—"} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">Keyword</th><th className="py-2 pr-4 font-medium">Dispositivo</th>
                <th className="py-2 pr-4 font-medium text-right">Última</th><th className="py-2 pr-4 font-medium text-right">Mejor</th><th className="py-2 pr-4 font-medium">Chequeo</th>
              </tr></thead>
              <tbody>
                {data.rank.topRank.map((k, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 text-gray-900">{k.keyword}</td>
                    <td className="py-2 pr-4 text-gray-500">{k.device === "mobile" ? "Móvil" : "Escritorio"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-900">{k.lastPosition ?? "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums font-medium text-gray-900">{k.bestPosition ?? "—"}</td>
                    <td className="py-2 pr-4 text-gray-400">{fmtDate(k.lastCheckedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rank.keywords.length > 10 && <p className="text-xs text-gray-400 mt-2">Mostrando las 10 mejores de {data.rank.keywords.length} keywords.</p>}
          </div>
        </>
      )}
    </section>
  );

  const renderKeywords = () => (
    <section className="space-y-4">
      <SectionTitle icon={<Search className="h-4 w-4" />}>
        Investigación de keywords <span className="text-gray-400 font-normal text-sm">(Estudios, estado actual)</span>
      </SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Estudios guardados" value={String(data.keywords.studyCount)} />
        <Stat label="Keywords investigadas" value={String(data.keywords.keywordTotal)} />
      </div>
      {data.keywords.studyCount === 0 && <p className="text-sm text-gray-500">Aún no hay estudios de keywords para este proyecto.</p>}
    </section>
  );

  const renderArquitectura = () => (
    <section className="space-y-4">
      <SectionTitle icon={<Network className="h-4 w-4" />}>
        Arquitectura de URLs <span className="text-gray-400 font-normal text-sm">(última estructura generada)</span>
      </SectionTitle>
      {!data.arquitectura || data.arquitectura.pages.length === 0 ? (
        <p className="text-sm text-gray-500">Sin arquitectura de URLs generada. Créala desde el módulo Arquitectura.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.arquitectura.pages.map((p, i) => (
            <li key={i} className="border-b border-gray-100 pb-1 last:border-0">
              <span className="text-gray-900">{p.h1}</span>
              <span className="text-gray-400 font-mono text-xs ml-2">/{p.slug}</span>
            </li>
          ))}
          <p className="text-xs text-gray-400 mt-1">Estructura del {fmtDate(data.arquitectura.updatedAt)}.</p>
        </ul>
      )}
    </section>
  );

  const renderTitulosMeta = () => (
    <section className="space-y-4">
      <SectionTitle icon={<Type className="h-4 w-4" />}>Título y Meta <span className="text-gray-400 font-normal text-sm">(últimas generaciones)</span></SectionTitle>
      {data["titulos-meta"].length === 0 ? (
        <p className="text-sm text-gray-500">Sin generaciones de título/meta todavía.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {data["titulos-meta"].map((g, i) => (
            <li key={i} className="border-b border-gray-100 pb-2 last:border-0">
              <p className="text-xs text-gray-400">{g.url}</p>
              <p className="text-gray-900">{g.variants[0]?.title ?? "—"}</p>
              <p className="text-xs text-gray-500">{g.variants[0]?.description}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const renderSchema = () => (
    <section className="space-y-4">
      <SectionTitle icon={<Code2 className="h-4 w-4" />}>Schema <span className="text-gray-400 font-normal text-sm">(últimas generaciones)</span></SectionTitle>
      {data.schema.length === 0 ? (
        <p className="text-sm text-gray-500">Sin generaciones de schema todavía.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.schema.map((g, i) => (
            <li key={i} className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1 last:border-0">
              <span className="text-gray-900 truncate">{g.selectedType}</span>
              <span className="text-xs text-gray-400 truncate">{g.url}</span>
              <span className={g.valid ? "text-[10px] text-emerald-600" : "text-[10px] text-amber-600"}>{g.valid ? "válido" : "avisos"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const renderContenido = () => (
    <section className="space-y-4">
      <SectionTitle icon={<PenLine className="h-4 w-4" />}>Contenido <span className="text-gray-400 font-normal text-sm">(últimas generaciones)</span></SectionTitle>
      {data.contenido.length === 0 ? (
        <p className="text-sm text-gray-500">Sin contenidos generados todavía.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.contenido.map((g, i) => (
            <li key={i} className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1 last:border-0">
              <span className="text-gray-900 truncate">{g.topic}</span>
              <span className="text-xs text-gray-400">{fmtDate(g.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const renderGoogle = () => (
    <section className="space-y-4">
      <SectionTitle icon={<Globe className="h-4 w-4" />}>
        Google (Search Console) <span className="text-gray-400 font-normal text-sm">(snapshot {data.google?.month ?? "—"}, últimos {data.google?.rangeDays ?? "—"} días)</span>
      </SectionTitle>
      {!data.google ? (
        <p className="text-sm text-gray-500">Sin datos de Search Console. Conecta la propiedad desde el módulo Google.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Clics" value={fmtInt(data.google.totals.clicks)} />
            <Stat label="Impresiones" value={fmtInt(data.google.totals.impressions)} />
            <Stat label="CTR medio" value={`${(data.google.totals.ctr * 100).toFixed(1)}%`} />
            <Stat label="Posición media" value={data.google.totals.position.toFixed(1)} />
          </div>
          {data.google.topQueries.length > 0 && (
            <ul className="text-sm space-y-1">
              <p className="text-xs text-gray-400">Top queries reales:</p>
              {data.google.topQueries.map((q, i) => (
                <li key={i} className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1 last:border-0">
                  <span className="text-gray-900 truncate">{q.query}</span>
                  <span className="text-xs text-gray-400">{fmtInt(q.clicks)} clics · pos. {q.position.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );

  const renderCanibalizaciones = () => (
    <section className="space-y-4">
      <SectionTitle icon={<GitBranch className="h-4 w-4" />}>
        Canibalizaciones <span className="text-gray-400 font-normal text-sm">(últimos 90 días, Search Console)</span>
      </SectionTitle>
      {!data.canibalizaciones || data.canibalizaciones.count === 0 ? (
        <p className="text-sm text-gray-500">No se detectan canibalizaciones o no hay conexión con Search Console.</p>
      ) : (
        <>
          <Stat label="Queries canibalizadas" value={String(data.canibalizaciones.count)} />
          <ul className="text-sm space-y-1">
            {data.canibalizaciones.top.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1 last:border-0">
                <span className="text-gray-900 truncate">“{c.query}”</span>
                <span className="text-xs text-gray-400">{c.urls} URLs · {fmtInt(c.clicks)} clics</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );

  const renderGeogrid = () => {
    if (!data.project.isLocalBusiness) return null;
    return (
      <section className="space-y-4">
        <SectionTitle icon={<MapPin className="h-4 w-4" />}>SEO Local <span className="text-gray-400 font-normal text-sm">(Geogrid)</span></SectionTitle>
        {!data.geogrid || data.geogrid.foundCount == null ? (
          <p className="text-sm text-gray-500">Sin geogrids completados hasta este mes.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <GeogridMap centerLat={data.geogrid.centerLat} centerLng={data.geogrid.centerLng} radiusKm={data.geogrid.radiusKm} points={(data.geogrid.points ?? []).map((p) => ({ row: p.row, col: p.col, lat: p.lat, lng: p.lng, position: p.position, title: null }))} keyword={data.geogrid.keyword} />
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                <span className="flex items-center gap-0.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Top 3</span>
                <span className="flex items-center gap-0.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> 4–10</span>
                <span className="flex items-center gap-0.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> 11–20</span>
                <span className="flex items-center gap-0.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> +20</span>
                <span className="flex items-center gap-0.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> No aparece</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <Stat label="Visibilidad" value={`${data.geogrid.foundCount}/${data.geogrid.gridSize * data.geogrid.gridSize}`} sub="puntos donde aparece el negocio" />
                <Stat label="Posición media" value={data.geogrid.averagePosition != null ? data.geogrid.averagePosition.toFixed(1) : "—"} />
                <Stat label="Rejilla" value={`${data.geogrid.gridSize}×${data.geogrid.gridSize}`} sub={`radio ${data.geogrid.radiusKm} km`} />
              </div>
              <p className="text-xs text-gray-400">«{data.geogrid.keyword}» · Geogrid completado el {fmtDate(data.geogrid.completedAt)}</p>
            </div>
          </div>
        )}
      </section>
    );
  };

  const renderLinks = () => (
    <section className="space-y-4">
      <SectionTitle icon={<Network className="h-4 w-4" />}>Enlaces internos <span className="text-gray-400 font-normal text-sm">(PageRank, última auditoría)</span></SectionTitle>
      {!data.links || data.links.pages.length === 0 ? (
        <p className="text-sm text-gray-500">Sin grafo de enlaces disponible. Ejecuta una auditoría para analizar el enlazado interno.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="URLs analizadas" value={String(data.links.pages.length)} sub={`auditoría del ${fmtDate(data.links.auditDate)}`} />
            <Stat label="Páginas huérfanas" value={String(data.links.orphans.length)} sub="sin enlaces entrantes" />
            <Stat label="Top distribuidora" value={data.links.topHubs[0] ? (() => { try { return new URL(data.links.topHubs[0]).pathname || "/"; } catch { return data.links.topHubs[0]; } })() : "—"} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">URL</th><th className="py-2 pr-4 font-medium text-right">PageRank</th>
                <th className="py-2 pr-4 font-medium text-right">Entrantes</th><th className="py-2 pr-4 font-medium text-right">Salientes</th>
              </tr></thead>
              <tbody>
                {data.links.pages.slice(0, 10).map((p) => (
                  <tr key={p.url} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 text-gray-900 max-w-[320px] truncate">{p.url}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-900">{(p.pagerank * 100).toFixed(2)}%</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-500">{p.incoming}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-500">{p.outgoing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.links.pages.length > 10 && <p className="text-xs text-gray-400 mt-2">Mostrando las 10 principales de {data.links.pages.length} URLs.</p>}
          </div>
        </>
      )}
    </section>
  );

  const renderCompetitors = () => (
    <section className="space-y-4">
      <SectionTitle icon={<Target className="h-4 w-4" />}>Competidores <span className="text-gray-400 font-normal text-sm">(Visibilidad, último análisis)</span></SectionTitle>

      {data.competitors.own && (
        <div className="space-y-2 break-inside-avoid">
          <p className="text-sm font-medium text-gray-700">
            Tu visibilidad {data.project.domain ? `· ${data.project.domain}` : ""}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Tráfico orgánico (est. mensual)" value={fmtTraffic(data.competitors.own.organicTraffic)} />
            <Stat
              label="Keywords orgánicas"
              value={data.competitors.own.organicKeywords?.toLocaleString("es-ES") ?? "—"}
              sub={`Análisis del ${fmtDate(data.competitors.own.fetchedAt)}`}
            />
          </div>
          {data.competitors.own.topKeywords && data.competitors.own.topKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.competitors.own.topKeywords.slice(0, 15).map((k, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-gray-50 text-gray-600">
                  {k.keyword}
                  {k.position !== null && <span className="text-gray-400">· #{k.position}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {data.competitors.items.length === 0 ? (
        <p className="text-sm text-gray-500">Sin competidores trackeados.</p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-400 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">Dominio</th><th className="py-2 pr-4 font-medium text-right">Tráfico orgánico</th>
                <th className="py-2 pr-4 font-medium text-right">Keywords</th><th className="py-2 pr-4 font-medium">Análisis</th>
              </tr></thead>
              <tbody>
                {data.competitors.items.map((c) => (
                  <tr key={c.domain} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 text-gray-900">{c.domain}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-900">{fmtTraffic(c.organicTraffic)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-500">{c.organicKeywords?.toLocaleString("es-ES") ?? "—"}</td>
                    <td className="py-2 pr-4 text-gray-400">{fmtDate(c.fetchedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.competitors.items.map((c) =>
            c.contentGap && c.contentGap.length > 0 ? (
              <div key={c.domain} className="break-inside-avoid">
                <p className="text-xs text-gray-500 mb-1.5">
                  Content gap con {c.domain} ({c.contentGap.length}) — ranquea por estas y tú no
                  {c.contentGapAt ? ` · ${fmtDate(c.contentGapAt)}` : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {c.contentGap.slice(0, 15).map((k, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                      {k.keyword}
                      {k.volume !== null && <span className="text-emerald-500">· {k.volume.toLocaleString("es-ES")}</span>}
                    </span>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </section>
  );

  const renderCosts = () => (
    <section className="space-y-4">
      <SectionTitle icon={<Wallet className="h-4 w-4" />}>Coste del mes <span className="text-gray-400 font-normal text-sm">({data.monthLabel})</span></SectionTitle>
      <div className="grid grid-cols-1 gap-4">
        <Stat label="Gasto en APIs" value={`${data.costs.monthCost.toFixed(2)}$`} sub="DataForSEO + OpenRouter" />
      </div>
    </section>
  );

  const dispatch: Record<SectionKey, () => React.ReactNode> = {
    tasks: renderTasks,
    audit: renderAudit,
    rank: renderRank,
    keywords: renderKeywords,
    arquitectura: renderArquitectura,
    "titulos-meta": renderTitulosMeta,
    schema: renderSchema,
    contenido: renderContenido,
    google: renderGoogle,
    canibalizaciones: renderCanibalizaciones,
    geogrid: renderGeogrid,
    links: renderLinks,
    competitors: renderCompetitors,
    costs: renderCosts,
  };

  const visibleSections = order.filter((k) => config[k]);

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[19rem_1fr] gap-6 items-start">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { margin: 1.5cm; }
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
          aside, header, nav { display: none !important; }
          main { overflow: visible !important; height: auto !important; padding: 0 !important; }
          section { break-inside: avoid; }
          tr { break-inside: avoid; }
        }
      ` }} />

      {/* Columna izquierda: navegación de mes + configuración de secciones.
          Sticky en escritorio; oculta al imprimir. */}
      <aside className="lg:sticky lg:top-6 self-start space-y-4 print:hidden">
        {/* Navegación de mes a ancho completo (antes compartía fila con el
            botón de imprimir y se cortaba en el aside estrecho). */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1 py-1">
          <Link href={data.prevHref} className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-md" title="Mes anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="flex-1 text-sm font-medium text-gray-900 px-2 text-center">{data.monthLabel}</span>
          {data.nextHref === null ? (
            <span className="p-1.5 text-gray-300"><ChevronRight className="h-4 w-4" /></span>
          ) : (
            <Link href={data.nextHref} className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-md" title="Mes siguiente"><ChevronRight className="h-4 w-4" /></Link>
          )}
        </div>
        <PrintButton className="w-full" />

        {/* Panel de control: secciones activables + reordenables */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Secciones del informe</h3>
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs text-emerald-600">Configuración guardada</span>}
              <button type="button" onClick={save} disabled={saving} className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar configuración"}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">Activa o desactiva cada sección y reordénala con las flechas ↑ ↓.</p>
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {order.map((key, i) => (
              <li key={key} className="flex items-center gap-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                  <input type="checkbox" checked={config[key]} onChange={() => toggle(key)} className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400" />
                  <span className="text-gray-700 truncate">{SECTION_LABELS[key]}</span>
                </label>
                <button type="button" onClick={() => move(key, -1)} disabled={i === 0} className="p-1 text-gray-300 hover:text-gray-900 disabled:opacity-30" title="Subir"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(key, 1)} disabled={i === order.length - 1} className="p-1 text-gray-300 hover:text-gray-900 disabled:opacity-30" title="Bajar"><ChevronDown className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Hoja del informe — se renderizan las secciones activadas, en el orden elegido */}
      <div className="bg-white rounded-xl border border-gray-200 px-8 py-10 space-y-8 print:border-0 print:rounded-none print:px-0 print:py-0">
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

        {visibleSections.map((key) => (
          <div key={key}>{dispatch[key]()}</div>
        ))}

        <footer className="border-t border-gray-200 pt-4 text-xs text-gray-400 print:text-black">
          Informe generado por SEO Ciro · Agencia Ciro
          {!data.isCurrentMonth && " · Informe de un mes anterior — los datos de estado (salud técnica, SEO local) reflejan la última medición hasta el fin de ese mes."}
        </footer>
      </div>
    </div>
  );
}
