"use client";

import { Fragment, useEffect, useState } from "react";
import {
  Loader2, Sparkles, Plus, Trash2, Target, TrendingUp, AlertTriangle,
  ExternalLink, ChevronDown, ChevronUp, ArrowDownToLine, Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import LocationPicker, { type LocationValue } from "@/components/admin/LocationPicker";
import PositionDistribution, { type PositionBuckets } from "@/components/admin/PositionDistribution";
import {
  competitorAnalysisCostUsd,
  contentGapCostUsd,
} from "@/lib/dataforseo/pricing";

// Item enriquecido de keyword (visibilidad o content gap). Todos los campos
// extra llegan GRATIS en la misma respuesta Labs que ya pagábamos — antes se
// descartaban. CPC y dificultad sirven para priorizar; la URL y el snippet
// (description) son "cómo posiciona el competidor", el ejemplo de copy más
// accionable de todo el módulo.
type TopKeyword = {
  keyword: string;
  position: number | null;
  volume: number | null;
  competition: string | null; // HIGH | MEDIUM | LOW
  competitionIndex: number | null; // 0-100
  cpc: number | null;
  monthlySearches: number[] | null;
  title: string | null;
  url: string | null;
  description: string | null;
};

type Snapshot = {
  id: string;
  domain: string;
  organicTraffic: number | null;
  organicKeywords: number | null;
  positionBuckets: PositionBuckets | null;
  avgPosition: number | null;
  topKeywords: TopKeyword[] | null;
  fetchedAt: string;
} | null;

type Competitor = {
  id: string;
  domain: string;
  contentGap: TopKeyword[] | null;
  contentGapAt: string | null;
  snapshot: Snapshot;
};

type Data = {
  projectDomain: string | null;
  projectSnapshot: Snapshot;
  competitors: Competitor[];
};

// Estimaciones orientativas (como en geogrid/rank tracking).
const analyzeCost = competitorAnalysisCostUsd();
const gapCost = contentGapCostUsd();

function fmtTraffic(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}

function fmtCpc(v: number | null | undefined): string {
  // nullish (== null): cubre null Y undefined. Los items viejos del content
  // gap/top keywords NO tienen cpc (campo ausente → undefined), no null —
  // chequear solo `=== null` dejaba pasar undefined y rompía en .toFixed().
  if (v == null) return "—";
  return `${(v as number).toFixed(2)}$`;
}

// Mini-sparkline de estacionalidad (12 meses). El dato llega gratis en cada
// item de content gap / ranked (keyword_info.monthly_searches); antes se
// tiraba. Aquí sirve para descartar keywords que pican solo en una época o,
// al revés, para detectar oportunidades estacionales. Null → "—".
function SeasonalitySparkline({ points }: { points: number[] | null | undefined }) {
  if (!points || points.length < 2) return <span className="text-gray-300">—</span>;
  const W = 44;
  const H = 16;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / range) * H;
  const pts = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const title = `Estacionalidad 12m · pico ${max.toLocaleString("es-ES")} · actual ${points[points.length - 1].toLocaleString("es-ES")}`;
  return (
    <svg width={W} height={H} className="text-gray-400" role="img" aria-label={title}>
      <title>{title}</title>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.25} />
    </svg>
  );
}

// Dificultad unificada: prioriza la etiqueta HIGH/MEDIUM/LOW (más legible) y
// recurre al índice 0-100 si la etiqueta no viene. Devuelve {label, color}
// para pintar un chip consistente.
function difficulty(
  competition: string | null,
  index: number | null
): { label: string; cls: string } {
  if (competition === "HIGH" || (competition === null && index !== null && index >= 67)) {
    return { label: "Alta", cls: "bg-red-50 text-red-700" };
  }
  if (competition === "LOW" || (competition === null && index !== null && index < 34)) {
    return { label: "Baja", cls: "bg-emerald-50 text-emerald-700" };
  }
  if (competition === "MEDIUM" || index !== null) {
    return { label: "Media", cls: "bg-amber-50 text-amber-700" };
  }
  return { label: "?", cls: "bg-gray-100 text-gray-400" };
}

function TrafficSparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const W = 200;
  const H = 48;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / range) * H;
  const pts = points.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={W} height={H} className="text-gray-300">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

// Vista de visibilidad de un dominio (KPIs + distribución + tendencia).
function VisibilityKpis({ snapshot, trend }: { snapshot: Snapshot; trend?: number[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div>
        <div className="text-2xl font-semibold text-gray-900">{fmtTraffic(snapshot?.organicTraffic ?? null)}</div>
        <div className="text-sm text-gray-500">Tráfico orgánico (est. mensual)</div>
      </div>
      <div>
        <div className="text-2xl font-semibold text-gray-900">{snapshot?.organicKeywords?.toLocaleString("es-ES") ?? "—"}</div>
        <div className="text-sm text-gray-500">Keywords orgánicas</div>
      </div>
      {snapshot?.positionBuckets ? (
        <div className="space-y-1">
          <div className="text-sm text-gray-500">Fuerza del dominio</div>
          <PositionDistribution buckets={snapshot.positionBuckets} avgPosition={snapshot.avgPosition} />
        </div>
      ) : trend && trend.length >= 2 ? (
        <div className="flex flex-col items-start">
          <TrafficSparkline points={trend} />
          <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
            <TrendingUp className="h-3 w-3" /> {trend.length} análisis
          </span>
        </div>
      ) : (
        <div className="flex items-center text-xs text-gray-400">Sin tendencia todavía</div>
      )}
    </div>
  );
}

// Chips compactos para las top keywords de un dominio (propio o competidor):
// keyword · volumen · #posición, más badge de dificultad cuando se conoce.
function KeywordChips({ keywords, colorClass }: { keywords: TopKeyword[]; colorClass: string }) {
  return (
    <div className="max-h-64 overflow-y-auto flex flex-wrap content-start gap-1.5">
      {keywords.map((k, i) => {
        const dif = difficulty(k.competition, k.competitionIndex);
        return (
          <span key={i} className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded", colorClass)}>
            {k.keyword}
            {k.volume != null && <span className="opacity-70">· {k.volume.toLocaleString("es-ES")}</span>}
            {k.position != null && <span className="opacity-70">· #{k.position}</span>}
            {k.cpc != null && <span className="opacity-70">· {fmtCpc(k.cpc)}</span>}
            {(k.competition || k.competitionIndex != null) && (
              <span className={cn("px-1 rounded font-medium", dif.cls)} title={`Dificultad ${dif.label}`}>
                {dif.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function TopKeywords({ keywords, title }: { keywords: TopKeyword[] | null; title: string }) {
  const [search, setSearch] = useState("");
  if (!keywords || keywords.length === 0) {
    return <p className="text-xs text-gray-400">{title}: sin datos aún.</p>;
  }
  const q = search.trim().toLowerCase();
  const filtered = q ? keywords.filter((k) => k.keyword.toLowerCase().includes(q)) : keywords;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-gray-500">{title} ({keywords.length})</p>
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar keyword..."
          className="px-2 py-1 border border-gray-200 rounded text-[11px] outline-none focus:border-gray-400 w-36"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400">Sin resultados para &laquo;{search}&raquo;.</p>
      ) : (
        <KeywordChips keywords={filtered} colorClass="bg-gray-50 text-gray-600" />
      )}
    </div>
  );
}

// Content gap como TABLA rica: cada fila es accionable — volumen, CPC y
// dificultad para priorizar, y al expandir, el snippet + título + URL con la
// que el competidor posiciona esa keyword (ejemplo de copy). Antes solo se veían
// 3 campos de los 10 que ya pagábamos.
function ContentGapList({ items, contentGapAt }: { items: TopKeyword[]; contentGapAt: string | null }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((k) => k.keyword.toLowerCase().includes(q)) : items;
  return (
    <div className="pt-2 border-t border-gray-100 space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-gray-500">
          Content gap ({items.length}) — ranquea por estas y tú no
          {contentGapAt ? ` · ${new Date(contentGapAt).toLocaleDateString("es-ES")}` : ""}
        </p>
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar keyword..."
          className="px-2 py-1 border border-gray-200 rounded text-[11px] outline-none focus:border-gray-400 w-36"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400">Sin resultados para &laquo;{search}&raquo;.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 text-left text-gray-400">
              <tr>
                <th className="py-1.5 pl-2 pr-2 font-medium">Keyword</th>
                <th className="py-1.5 px-2 font-medium text-right">Vol.</th>
                <th className="py-1.5 px-2 font-medium text-center">Tend.</th>
                <th className="py-1.5 px-2 font-medium text-right">CPC</th>
                <th className="py-1.5 px-2 font-medium text-right">Dif.</th>
                <th className="py-1.5 px-2 font-medium text-right">#</th>
                <th className="py-1.5 pr-2 pl-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((k, i) => {
                const dif = difficulty(k.competition, k.competitionIndex);
                const isOpen = expanded === `${i}-${k.keyword}`;
                const hasDetail = Boolean(k.description || k.title || k.url);
                return (
                  <Fragment key={i}>
                    <tr className="border-t border-gray-50 hover:bg-gray-50/60">
                      <td className="py-1.5 pl-2 pr-2 text-gray-900 font-medium">{k.keyword}</td>
                      <td className="py-1.5 px-2 text-right text-gray-600 tabular-nums">
                        {k.volume != null ? k.volume.toLocaleString("es-ES") : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <SeasonalitySparkline points={k.monthlySearches} />
                      </td>
                      <td className="py-1.5 px-2 text-right text-gray-600 tabular-nums">{fmtCpc(k.cpc)}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className={cn("inline-block px-1.5 py-0.5 rounded font-medium", dif.cls)}>{dif.label}</span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-gray-600 tabular-nums">
                        {k.position != null ? `#${k.position}` : "—"}
                      </td>
                      <td className="py-1.5 pr-2 pl-2 text-right">
                        {hasDetail && (
                          <button
                            onClick={() => setExpanded(isOpen ? null : `${i}-${k.keyword}`)}
                            className="text-gray-400 hover:text-gray-700"
                            title="Ver cómo lo posiciona el competidor"
                          >
                            {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && hasDetail && (
                      <tr className="border-t border-gray-50 bg-emerald-50/40">
                        <td colSpan={7} className="px-3 py-2 space-y-1">
                          {k.title && <p className="text-xs font-medium text-gray-800">{k.title}</p>}
                          {k.description && (
                            <p className="text-xs text-gray-600 leading-relaxed">{k.description}</p>
                          )}
                          {k.url && (
                            <a
                              href={k.url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                            >
                              <span className="truncate max-w-md">{k.url}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CompetidoresView({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addDomain, setAddDomain] = useState("");
  const [analyzingDomain, setAnalyzingDomain] = useState<string | null>(null);
  const [gapId, setGapId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  // Series de tendencia agrupadas por dominio (proyecto + competidores). Una
  // sola llamada a /tendencia (sin ?domain) alimenta TODOS los sparklines en
  // vez de pedir uno por competidor. Antes solo tenía tendencia el dominio
  // propio; ahora cada tarjeta de competidor muestra su evolución.
  const [trendsByDomain, setTrendsByDomain] = useState<Record<string, number[]>>({});
  // Ubicación usada por TODOS los análisis (propio + competidores) y el
  // content gap de esta sesión — DataForSEO Labs también resuelve tráfico y
  // keywords por punto geográfico, no solo a nivel país.
  const [location, setLocation] = useState<LocationValue>(null);

  function load() {
    return fetch(`/api/proyectos/${projectId}/competidores`)
      .then((r) => r.json())
      .then((d: Data) => {
        if (d && d.competitors) setData(d);
      });
  }

  // Recarga las series de tendencia. Sin `domain` → trae TODOS los dominios
  // del proyecto en una sola respuesta y se agrupan aquí en el cliente.
  async function loadTrends(domain?: string) {
    const url = domain
      ? `/api/proyectos/${projectId}/competidores/tendencia?domain=${encodeURIComponent(domain)}`
      : `/api/proyectos/${projectId}/competidores/tendencia`;
    const t = await fetch(url).then((r) => r.json());
    if (!Array.isArray(t)) return;
    const byDomain: Record<string, number[]> = {};
    for (const s of t as { domain: string; organicTraffic: number | null }[]) {
      if (!byDomain[s.domain]) byDomain[s.domain] = [];
      byDomain[s.domain].push(s.organicTraffic ?? 0);
    }
    setTrendsByDomain((prev) => (domain ? { ...prev, ...byDomain } : byDomain));
  }

  useEffect(() => {
    // Carga inicial: visibilidad + TODAS las series de tendencia agrupadas por
    // dominio (proyecto + competidores) en una sola respuesta. El agrupado y
    // el setState viven dentro del .then (patrón async, no marca la regla
    // set-state-in-effect); loadTrends() nominado se reserva para el refresco
    // tras "Analizar", que cuelga de un handler (no de un effect).
    Promise.all([
      load(),
      fetch(`/api/proyectos/${projectId}/competidores/tendencia`).then((r) => r.json()),
    ]).then(([, t]) => {
      if (Array.isArray(t)) {
        const byDomain: Record<string, number[]> = {};
        for (const s of t as { domain: string; organicTraffic: number | null }[]) {
          if (!byDomain[s.domain]) byDomain[s.domain] = [];
          byDomain[s.domain].push(s.organicTraffic ?? 0);
        }
        setTrendsByDomain(byDomain);
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/proyectos/${projectId}/competidores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: addDomain }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Error al añadir");
      return;
    }
    setAddDomain("");
    load();
  }

  async function handleAnalyze(domain: string) {
    setError("");
    setAnalyzingDomain(domain);
    const res = await fetch(`/api/proyectos/${projectId}/competidores/analizar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, locationCode: location?.code }),
    });
    const d = await res.json();
    setAnalyzingDomain(null);
    if (!res.ok) {
      setError(d.error ?? "Error al analizar");
      return;
    }
    await load();
    // refresca la tendencia del dominio recién analizado (el propio o un
    // competidor) para que su sparkline se actualice al momento.
    await loadTrends(domain);
  }

  async function handleGap(competitorId: string) {
    setError("");
    setGapId(competitorId);
    const res = await fetch(`/api/proyectos/${projectId}/competidores/${competitorId}/content-gap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationCode: location?.code }),
    });
    const d = await res.json();
    setGapId(null);
    if (!res.ok) {
      setError(d.error ?? "Error al calcular content gap");
      return;
    }
    load();
  }

  async function handleRemove(competitorId: string) {
    setRemoving(true);
    await fetch(`/api/proyectos/${projectId}/competidores/${competitorId}`, { method: "DELETE" });
    setRemoving(false);
    setConfirmRemoveId(null);
    load();
  }

  // Recoge las keywords únicas de un competidor (content gap优先, complementado
  // con sus top keywords). Es la materia prima para "importar a estudio" o
  // "añadir a seguimiento": fricción cero para llevar la inteligencia del
  // competidor a los módulos donde se trabaja, sin copiar a mano.
  function collectKeywords(c: Competitor): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const sources = [c.contentGap ?? [], c.snapshot?.topKeywords ?? []];
    for (const arr of sources) {
      for (const k of arr) {
        const kw = k.keyword?.trim();
        if (kw && !seen.has(kw)) {
          seen.add(kw);
          out.push(kw);
        }
      }
    }
    return out;
  }

  function showNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 5000);
  }

  // Crea un estudio del Módulo 1 con las keywords del competidor (content gap
  // + top). Reutiliza el mismo endpoint que "pegar lista" / GSC → resuelve
  // volumen/intención gratis desde caché cuando ya se conoce.
  async function handleImportToStudy(c: Competitor) {
    const keywords = collectKeywords(c);
    if (keywords.length === 0) {
      showNotice("Este competidor no tiene keywords todavía.");
      return;
    }
    setImportingId(c.id);
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Competidor ${c.domain} — ${new Date().toLocaleDateString("es-ES")}`,
        keywords: keywords.join("\n"),
        locationCode: location?.code,
      }),
    });
    const d = await res.json();
    setImportingId(null);
    if (!res.ok) {
      showNotice(d.error ?? "Error al crear el estudio");
      return;
    }
    showNotice(`Estudio creado con ${d.keywords?.length ?? keywords.length} keywords de ${c.domain}.`);
  }

  // Añade las keywords del competidor a Rank Tracking (frecuencia manual, no
  // gasta solo). Reutiliza POST /rank/keywords (bulk).
  async function handleAddToTracking(c: Competitor) {
    const keywords = collectKeywords(c);
    if (keywords.length === 0) {
      showNotice("Este competidor no tiene keywords todavía.");
      return;
    }
    setTrackingId(c.id);
    const res = await fetch(`/api/proyectos/${projectId}/rank/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keywords: keywords.join("\n"),
        device: "desktop",
        frequency: "manual",
        depth: 10,
        locationCode: location?.code,
        group: `Competidores (${c.domain})`,
      }),
    });
    const d = await res.json();
    setTrackingId(null);
    if (!res.ok) {
      showNotice(d.error ?? "Error al añadir a seguimiento");
      return;
    }
    showNotice(`${d.added ?? 0} añadidas a seguimiento${d.skipped ? ` · ${d.skipped} ya seguidas` : ""} (manual — pulsa «Comprobar» para ver posición).`);
  }

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-gray-400" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Competidores</h2>
        <p className="text-sm text-gray-500 mt-1">
          Espía el tráfico orgánico estimado y las keywords de cualquier dominio (DataForSEO Labs), y
          descubre el content gap: keywords por las que ranquean y tú no, con CPC, dificultad y el
          snippet con el que posicionan.
        </p>
      </div>

      {/* Ubicación de todos los análisis de esta sesión (propio dominio,
          competidores y content gap) — un negocio local no compite igual a
          nivel nacional que en su ciudad. */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Ubicación de análisis <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <div className="max-w-sm">
          <LocationPicker value={location} onChange={setLocation} />
        </div>
        <p className="text-xs text-gray-400">
          Se aplica a &laquo;Analizar&raquo; y &laquo;Gap&raquo; de abajo. Sin elegir nada, España
          (nacional).
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">{notice}</p>}

      {/* Aviso de coste estimado por acción (como en geogrid/rank tracking) */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
        <span>Coste estimado por acción:</span>
        <span className="inline-flex items-center gap-1"><Target className="h-3.5 w-3.5 text-gray-400" /> Analizar visibilidad <strong className="text-gray-900">~${analyzeCost.toFixed(2)}</strong></span>
        <span className="inline-flex items-center gap-1"><Target className="h-3.5 w-3.5 text-gray-400" /> Content gap <strong className="text-gray-900">~${gapCost.toFixed(2)}</strong></span>
      </div>

      {/* Visibilidad del propio dominio */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Tu visibilidad {data?.projectDomain ? `· ${data.projectDomain}` : ""}</h3>
          <button
            onClick={() => data?.projectDomain && handleAnalyze(data.projectDomain)}
            disabled={!data?.projectDomain || analyzingDomain === data?.projectDomain}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
            title={`Coste estimado ~$${analyzeCost.toFixed(2)}`}
          >
            {analyzingDomain === data?.projectDomain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Analizar <span className="text-gray-300 font-normal">~${analyzeCost.toFixed(2)}</span>
          </button>
        </div>
        {!data?.projectDomain ? (
          <p className="text-sm text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Define el dominio del proyecto en su ficha para analizar su visibilidad.
          </p>
        ) : (
          <VisibilityKpis
            snapshot={data?.projectSnapshot ?? null}
            trend={data?.projectDomain ? trendsByDomain[data.projectDomain] : undefined}
          />
        )}
        {data?.projectSnapshot && (
          <TopKeywords keywords={data.projectSnapshot.topKeywords} title="Tus top keywords" />
        )}
      </div>

      {/* Añadir competidor */}
      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-100 p-5 flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <label className="block text-sm font-medium text-gray-700">Añadir competidor</label>
          <input
            type="text"
            value={addDomain}
            onChange={(e) => setAddDomain(e.target.value)}
            placeholder="competidor.com"
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>
        <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800">
          <Plus className="h-4 w-4" /> Añadir
        </button>
      </form>

      {/* Lista de competidores */}
      <div className="space-y-3">
        {data?.competitors.length === 0 && <p className="text-sm text-gray-500">Aún no hay competidores. Añade uno para espiar su visibilidad.</p>}
        {data?.competitors.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{c.domain}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
                  <span>Tráfico: <strong className="text-gray-700">{fmtTraffic(c.snapshot?.organicTraffic ?? null)}</strong></span>
                  <span>Keywords: <strong className="text-gray-700">{c.snapshot?.organicKeywords?.toLocaleString("es-ES") ?? "—"}</strong></span>
                  {c.snapshot && <span>· {new Date(c.snapshot.fetchedAt).toLocaleDateString("es-ES")}</span>}
                </div>
                {!c.snapshot && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mt-2">
                    Aún sin analizar. Pulsa <strong>Analizar</strong> a la derecha (cuesta{' '}
                    {analyzeCost.toFixed(2)}$) o <strong>Lanzar / re-procesar análisis</strong> en la
                    ficha del proyecto para procesar todos a la vez.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleAnalyze(c.domain)}
                  disabled={analyzingDomain === c.domain}
                  className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  title={`Analizar visibilidad · coste estimado ~$${analyzeCost.toFixed(2)}`}
                >
                  {analyzingDomain === c.domain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Analizar <span className="text-gray-400 font-normal">~${analyzeCost.toFixed(2)}</span>
                </button>
                <button
                  onClick={() => handleGap(c.id)}
                  disabled={gapId === c.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  title={`Content gap · coste estimado ~$${gapCost.toFixed(2)}`}
                >
                  {gapId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
                  Gap <span className="text-gray-400 font-normal">~${gapCost.toFixed(2)}</span>
                </button>
                <button onClick={() => setConfirmRemoveId(c.id)} className="p-1.5 text-gray-300 hover:text-red-600" title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {c.snapshot && <VisibilityKpis snapshot={c.snapshot} trend={trendsByDomain[c.domain]} />}
            {c.snapshot?.topKeywords && <TopKeywords keywords={c.snapshot.topKeywords} title="Sus top keywords" />}
            {c.contentGap && c.contentGap.length > 0 && (
              <ContentGapList items={c.contentGap} contentGapAt={c.contentGapAt} />
            )}
            {/* Acciones cruzadas: lleva la inteligencia del competidor a los
                módulos donde se trabaja (estudio / rank tracking), sin copiar
                a mano. Solo aparecen si hay keywords recolectadas. */}
            {collectKeywords(c).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => handleImportToStudy(c)}
                  disabled={importingId === c.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  title="Crear un estudio (Módulo 1) con las keywords de este competidor"
                >
                  {importingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                  Importar a estudio
                </button>
                <button
                  onClick={() => handleAddToTracking(c)}
                  disabled={trackingId === c.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  title="Añadir estas keywords a Rank Tracking (manual)"
                >
                  {trackingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
                  Añadir a seguimiento
                </button>
                <span className="text-[11px] text-gray-400">{collectKeywords(c).length} keywords</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmRemoveId !== null}
        title="¿Dejar de trackear este competidor?"
        description="Se borra su histórico de visibilidad y content gap guardados. No se puede deshacer."
        busy={removing}
        onCancel={() => setConfirmRemoveId(null)}
        onConfirm={() => confirmRemoveId && handleRemove(confirmRemoveId)}
      />
    </div>
  );
}
