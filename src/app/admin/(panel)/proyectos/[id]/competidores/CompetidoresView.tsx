"use client";

import { Fragment, useEffect, useState } from "react";
import {
  Loader2, Sparkles, Plus, Trash2, Target, TrendingUp, AlertTriangle,
  ExternalLink, ChevronDown, ChevronUp, ArrowDownToLine, Crosshair, FileSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import ImportSuccessNotice from "@/components/admin/ImportSuccessNotice";
import LocationPicker, { type LocationValue } from "@/components/admin/LocationPicker";
import PositionDistribution, { type PositionBuckets } from "@/components/admin/PositionDistribution";
import {
  competitorAnalysisCostUsd,
  contentGapCostUsd,
  onPageAnalysisCostUsd,
} from "@/lib/dataforseo/pricing";
import { importKeywordsToDefaultStudy } from "@/lib/keywords/client-import";

// Item enriquecido de keyword (visibilidad o content gap). Todos los campos
// extra llegan GRATIS en la misma respuesta Labs que ya pagábamos — antes se
// descartaban. CPC y dificultad sirven para priorizar; la URL y el snippet
// (description) son "cómo posiciona el competidor", el ejemplo de copy más
// accionable de todo el módulo.
type TopKeyword = {
  keyword: string;
  position: number | null;
  volume: number | null;
  competition: string | null; // HIGH | MEDIUM | LOW (Google Ads, no es dificultad SEO)
  competitionIndex: number | null; // 0-100 (Google Ads, no es dificultad SEO)
  cpc: number | null;
  monthlySearches: number[] | null;
  difficulty: number | null; // 0-100, dificultad SEO real (keyword_properties.keyword_difficulty)
  title: string | null;
  url: string | null;
  description: string | null;
};

// Análisis on-page de una URL suelta (Screaming Frog-like), vía DataForSEO
// On-Page API — ver src/lib/onpage/. Los campos boolean/issues reflejan
// exactamente lo que da la API real: no hay recuento de enlaces rotos (solo
// "¿tiene alguno?"), ni de imágenes sin alt (solo el mismo tipo de flag,
// dentro de `issues`).
type OnPageAnalysisData = {
  id: string;
  onPageScore: number | null;
  wordCount: number | null;
  characterCount: number | null;
  sentenceCount: number | null;
  titleLength: number | null;
  descriptionLength: number | null;
  htags: Record<string, string[]> | null;
  issues: string[] | null;
  readability: {
    automatedReadabilityIndex: number | null;
    colemanLiauReadabilityIndex: number | null;
    daleChallReadabilityIndex: number | null;
    fleschKincaidReadabilityIndex: number | null;
    smogReadabilityIndex: number | null;
  } | null;
  imagesCount: number | null;
  internalLinksCount: number | null;
  externalLinksCount: number | null;
  hasBrokenLinks: boolean | null;
  fetchedAt: string;
};

// Etiquetas en español para las incidencias más relevantes — el resto (hay
// ~45 posibles) se muestra con el nombre crudo formateado, sin necesidad de
// mantener una lista exhaustiva.
const ONPAGE_ISSUE_LABELS: Record<string, string> = {
  no_title: "Sin título",
  no_description: "Sin meta descripción",
  no_h1_tag: "Sin H1",
  title_too_long: "Título demasiado largo",
  title_too_short: "Título demasiado corto",
  duplicate_title_tag: "Título duplicado en la página",
  duplicate_meta_tags: "Meta tags duplicados",
  no_image_alt: "Imágenes sin alt",
  no_image_title: "Imágenes sin title",
  low_readability_rate: "Legibilidad baja",
  low_content_rate: "Poco texto respecto al peso de la página",
  is_broken: "Página caída (4xx/5xx)",
  is_4xx_code: "Error 4xx",
  is_5xx_code: "Error 5xx",
  is_redirect: "Redirección",
  no_favicon: "Sin favicon",
  irrelevant_title: "Título poco relevante para el contenido",
  irrelevant_description: "Meta descripción poco relevante",
  has_render_blocking_resources: "Recursos que bloquean el renderizado",
  high_loading_time: "Tiempo de carga alto",
  deprecated_html_tags: "Etiquetas HTML obsoletas",
  lorem_ipsum: "Contenido de relleno (lorem ipsum)",
};

function onPageIssueLabel(key: string): string {
  return ONPAGE_ISSUE_LABELS[key] ?? key.replace(/_/g, " ");
}

function OnPageReportDetail({ analysis }: { analysis: OnPageAnalysisData }) {
  const htags: Record<string, string[]> = analysis.htags ?? {};
  const htagLevels = Object.keys(htags).sort();
  return (
    <div className="mt-2 space-y-2 text-xs">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-gray-400">Palabras</p>
          <p className="font-semibold text-gray-900">{analysis.wordCount ?? "—"}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-gray-400">Caracteres</p>
          <p className="font-semibold text-gray-900">{analysis.characterCount ?? "—"}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2" title="DataForSEO no da recuento de frases; se estima sobre un fragmento del texto (primeros ~3000 caracteres), no la página completa — por eso puede parecer bajo frente al recuento de palabras.">
          <p className="text-gray-400">Frases (muestra)</p>
          <p className="font-semibold text-gray-900">{analysis.sentenceCount ?? "—"}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-gray-400">Puntuación on-page</p>
          <p className="font-semibold text-gray-900">{analysis.onPageScore != null ? `${Math.round(analysis.onPageScore)}/100` : "—"}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-gray-600">
        <span>Título: <strong className="text-gray-900">{analysis.titleLength ?? "—"}</strong> car.</span>
        <span>Meta descripción: <strong className="text-gray-900">{analysis.descriptionLength ?? "—"}</strong> car.</span>
        <span>Imágenes: <strong className="text-gray-900">{analysis.imagesCount ?? "—"}</strong></span>
        <span>Enlaces internos: <strong className="text-gray-900">{analysis.internalLinksCount ?? "—"}</strong></span>
        <span>Enlaces externos: <strong className="text-gray-900">{analysis.externalLinksCount ?? "—"}</strong></span>
        {analysis.hasBrokenLinks === true && (
          <span className="text-red-600 font-medium">Tiene enlaces rotos</span>
        )}
      </div>

      {htagLevels.length > 0 && (
        <div className="space-y-1">
          <p className="text-gray-500 font-medium">Jerarquía de encabezados</p>
          <ul className="space-y-0.5">
            {htagLevels.map((level) => (
              <li key={level} className="flex items-start gap-1.5">
                <span className="text-[10px] font-mono px-1 rounded bg-gray-100 text-gray-500 shrink-0 mt-0.5 uppercase">{level}</span>
                <span className="text-gray-700">
                  {(htags[level] ?? []).join("  ·  ") || <span className="text-gray-300">—</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.issues && analysis.issues.length > 0 && (
        <div className="space-y-1">
          <p className="text-gray-500 font-medium">Incidencias detectadas ({analysis.issues.length})</p>
          <div className="flex flex-wrap gap-1">
            {analysis.issues.map((issue) => (
              <span key={issue} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                {onPageIssueLabel(issue)}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis.readability?.fleschKincaidReadabilityIndex != null && (
        <p className="text-gray-500">
          Índice de legibilidad (Flesch-Kincaid): <strong className="text-gray-900">{analysis.readability.fleschKincaidReadabilityIndex.toFixed(1)}</strong>
        </p>
      )}
    </div>
  );
}

// Botón "Analizar página" por URL — al montar comprueba gratis si ya hay un
// análisis reciente (GET); si no, "Analizar" paga (DataForSEO On-Page API,
// guard de frescura de 7 días en el backend, ver src/lib/onpage/analyze.ts).
function OnPageButton({ projectId, url }: { projectId: string; url: string }) {
  const [analysis, setAnalysis] = useState<OnPageAnalysisData | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/proyectos/${projectId}/competidores/onpage?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d: OnPageAnalysisData | null) => {
        if (!cancelled && d && d.id) setAnalysis(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, url]);

  async function handleAnalyze() {
    setError("");
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/proyectos/${projectId}/competidores/onpage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al analizar la página");
        return;
      }
      setAnalysis(data);
      setExpanded(true);
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="mt-1.5 pt-1.5 border-t border-gray-100">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (analysis ? setExpanded((v) => !v) : handleAnalyze())}
          disabled={analyzing || checkingExisting}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          title={analysis ? "Ver informe on-page" : `Analizar página (~$${onPageAnalysisCostUsd().toFixed(4)}, gratis si ya se analizó hace menos de 7 días)`}
        >
          {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSearch className="h-3 w-3" />}
          {analysis ? (expanded ? "Ocultar informe on-page" : "Ver informe on-page") : "Analizar página"}
        </button>
        {analysis && (
          <span className="text-[10px] text-gray-400">
            {new Date(analysis.fetchedAt).toLocaleDateString("es-ES")}
          </span>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      {expanded && analysis && <OnPageReportDetail analysis={analysis} />}
    </div>
  );
}

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

// Dificultad SEO real (keyword_properties.keyword_difficulty, 0-100) — NO se
// deriva de `competition`/`competitionIndex` (eso es densidad de pujas de
// Google Ads, una señal distinta que antes se usaba como proxy y por eso
// casi siempre salía "Media" o "?"). Sin dato → "?".
function difficulty(score: number | null | undefined): { label: string; cls: string } {
  // == null (no ===): cubre null Y undefined. Los content gap/top keywords
  // guardados antes de que este campo existiera no tienen `difficulty` en su
  // JSON (ausente → undefined, no null) — chequear solo `=== null` dejaba
  // pasar undefined y caía siempre en la rama "Baja", igual que el bug ya
  // corregido en fmtCpc.
  if (score == null) return { label: "?", cls: "bg-gray-100 text-gray-400" };
  if (score >= 67) return { label: `${score} · Alta`, cls: "bg-red-50 text-red-700" };
  if (score >= 34) return { label: `${score} · Media`, cls: "bg-amber-50 text-amber-700" };
  return { label: `${score} · Baja`, cls: "bg-emerald-50 text-emerald-700" };
}

// Un snapshot puede existir en BD (el "Analizar" se pidió y respondió con
// éxito) pero venir vacío de señal real — dominios muy pequeños/nuevos sin
// presencia orgánica medible en DataForSEO. Sin esto, "Analizar todos" nunca
// volvía a incluirlos (contaba como "ya analizado" para siempre) y la
// tarjeta no mostraba ningún aviso, indistinguible a simple vista de "nunca
// se ha tocado".
function hasUsefulSnapshot(snapshot: Snapshot): boolean {
  if (!snapshot) return false;
  return (
    snapshot.organicTraffic != null ||
    snapshot.organicKeywords != null ||
    (snapshot.topKeywords != null && snapshot.topKeywords.length > 0)
  );
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
        const dif = difficulty(k.difficulty);
        return (
          <span key={i} className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded", colorClass)}>
            {k.keyword}
            {k.volume != null && <span className="opacity-70">· {k.volume.toLocaleString("es-ES")}</span>}
            {k.position != null && <span className="opacity-70">· #{k.position}</span>}
            {k.cpc != null && <span className="opacity-70">· {fmtCpc(k.cpc)}</span>}
            {k.difficulty != null && (
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
function ContentGapList({ items, contentGapAt, projectId }: { items: TopKeyword[]; contentGapAt: string | null; projectId: string }) {
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
                const dif = difficulty(k.difficulty);
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
                          {k.url && <OnPageButton projectId={projectId} url={k.url} />}
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
  // "Analizar todos" / "Gap todos" — procesa en bucle SECUENCIAL (nunca en
  // paralelo: assertWithinSpendLimit es check-then-act, un Promise.all podría
  // saltarse el tope de gasto viendo el mismo acumulado desactualizado) solo
  // los competidores que aún no tengan análisis/gap hecho. Los botones
  // individuales de cada fila no cambian.
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkAnalyzeProgress, setBulkAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkGapping, setBulkGapping] = useState(false);
  const [bulkGapProgress, setBulkGapProgress] = useState<{ done: number; total: number } | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [importNotice, setImportNotice] = useState<{ message: string; studyId: string } | null>(null);
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

  async function handleAnalyzeAll() {
    const pending = (data?.competitors ?? []).filter((c) => !hasUsefulSnapshot(c.snapshot));
    if (pending.length === 0 || bulkAnalyzing) return;
    setError("");
    setBulkAnalyzing(true);
    setBulkAnalyzeProgress({ done: 0, total: pending.length });

    let failures = 0;
    let stoppedForSpend = false;
    for (const c of pending) {
      setAnalyzingDomain(c.domain);
      try {
        const res = await fetch(`/api/proyectos/${projectId}/competidores/analizar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: c.domain, locationCode: location?.code }),
        });
        if (!res.ok) {
          if (res.status === 422) {
            stoppedForSpend = true;
            break; // tope de gasto — seguir repetiría el mismo fallo en los demás
          }
          failures++;
        }
      } catch {
        // Fallo de red: no dejamos el botón bloqueado, se cuenta como error
        // y se sigue con el siguiente competidor.
        failures++;
      }
      setBulkAnalyzeProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    if (stoppedForSpend) {
      setError("Tope de gasto alcanzado — se detiene «Analizar todos». Lo ya completado se ha guardado.");
    } else if (failures > 0) {
      setError(`${failures} competidor(es) fallaron al analizar — puedes reintentar con «Analizar todos» o su botón individual.`);
    }

    setAnalyzingDomain(null);
    setBulkAnalyzing(false);
    setBulkAnalyzeProgress(null);
    await load();
    await loadTrends();
  }

  async function handleGapAll() {
    const pending = (data?.competitors ?? []).filter((c) => !c.contentGap || c.contentGap.length === 0);
    if (pending.length === 0 || bulkGapping) return;
    setError("");
    setBulkGapping(true);
    setBulkGapProgress({ done: 0, total: pending.length });

    let failures = 0;
    let stoppedForSpend = false;
    for (const c of pending) {
      setGapId(c.id);
      try {
        const res = await fetch(`/api/proyectos/${projectId}/competidores/${c.id}/content-gap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationCode: location?.code }),
        });
        if (!res.ok) {
          if (res.status === 422) {
            stoppedForSpend = true;
            break;
          }
          failures++;
        }
      } catch {
        failures++;
      }
      setBulkGapProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    if (stoppedForSpend) {
      setError("Tope de gasto alcanzado — se detiene «Gap todos». Lo ya completado se ha guardado.");
    } else if (failures > 0) {
      setError(`${failures} competidor(es) fallaron al calcular el gap — puedes reintentar con «Gap todos» o su botón individual.`);
    }

    setGapId(null);
    setBulkGapping(false);
    setBulkGapProgress(null);
    await load();
  }

  async function handleRemove(competitorId: string) {
    setRemoving(true);
    await fetch(`/api/proyectos/${projectId}/competidores/${competitorId}`, { method: "DELETE" });
    setRemoving(false);
    setConfirmRemoveId(null);
    load();
  }

  // Recoge las keywords únicas de un competidor (content gap優先, complementado
  // con sus top keywords), con todas sus métricas ya resueltas — no solo el
  // texto. Es la materia prima para "importar a estudio" (gratis, ver abajo)
  // o "añadir a seguimiento": fricción cero para llevar la inteligencia del
  // competidor a los módulos donde se trabaja, sin copiar a mano.
  type CollectedKeyword = {
    keyword: string;
    volume: number | null;
    competition: string | null;
    cpc: number | null;
    monthlySearches: number[] | null;
    difficulty: number | null;
  };
  function collectKeywords(c: Competitor): CollectedKeyword[] {
    const seen = new Set<string>();
    const out: CollectedKeyword[] = [];
    const sources = [c.contentGap ?? [], c.snapshot?.topKeywords ?? []];
    for (const arr of sources) {
      for (const k of arr) {
        const kw = k.keyword?.trim();
        if (kw && !seen.has(kw)) {
          seen.add(kw);
          out.push({
            keyword: kw,
            volume: k.volume,
            competition: k.competition,
            cpc: k.cpc,
            monthlySearches: k.monthlySearches,
            difficulty: k.difficulty,
          });
        }
      }
    }
    return out;
  }

  function showNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 5000);
  }

  // Lleva las keywords del competidor (content gap + top) al estudio
  // "General" único del proyecto, con las métricas YA resueltas
  // (volumen/competencia/CPC/estacionalidad, pagadas por el análisis de
  // competidores) — a diferencia de antes, no se vuelve a consultar
  // DataForSEO: coste cero.
  async function handleImportToStudy(c: Competitor) {
    const keywords = collectKeywords(c);
    if (keywords.length === 0) {
      showNotice("Este competidor no tiene keywords todavía.");
      return;
    }
    setImportingId(c.id);
    // Propaga la ubicación real con la que se analizó (el LocationPicker de
    // arriba) — si no, el endpoint cachearía este volumen bajo la ubicación
    // del estudio "General" (siempre es/2724), mezclando datos de una
    // ubicación local con la clave nacional del caché compartido.
    const result = await importKeywordsToDefaultStudy(projectId, `Competidor ${c.domain}`, keywords, {
      locationCode: location?.code ?? 2724,
      languageCode: "es",
    });
    setImportingId(null);
    if (!result.ok) {
      showNotice(result.error);
      return;
    }
    setImportNotice({
      message: `${result.added} keywords de ${c.domain} añadidas al estudio General (sin coste adicional).`,
      studyId: result.studyId,
    });
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
        keywords: keywords.map((k) => k.keyword).join("\n"),
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
      {importNotice && (
        <ImportSuccessNotice
          message={importNotice.message}
          projectId={projectId}
          studyId={importNotice.studyId}
          onDismiss={() => setImportNotice(null)}
        />
      )}

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

      {/* Analizar todos / Gap todos — solo los competidores sin análisis o
          sin gap hecho, en bucle secuencial. Los botones por fila de abajo
          siguen disponibles para reanalizar uno suelto en cualquier momento. */}
      {data && data.competitors.length > 0 && (() => {
        const pendingAnalyze = data.competitors.filter((c) => !hasUsefulSnapshot(c.snapshot)).length;
        const pendingGap = data.competitors.filter((c) => !c.contentGap || c.contentGap.length === 0).length;
        return (
          <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleAnalyzeAll}
              disabled={pendingAnalyze === 0 || bulkAnalyzing}
              className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {bulkAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {bulkAnalyzeProgress
                ? `Analizando ${bulkAnalyzeProgress.done}/${bulkAnalyzeProgress.total}...`
                : `Analizar todos${pendingAnalyze > 0 ? ` (${pendingAnalyze} pendientes)` : ""}`}
            </button>
            <button
              onClick={handleGapAll}
              disabled={pendingGap === 0 || bulkGapping}
              className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {bulkGapping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
              {bulkGapProgress
                ? `Calculando gap ${bulkGapProgress.done}/${bulkGapProgress.total}...`
                : `Gap todos${pendingGap > 0 ? ` (${pendingGap} pendientes)` : ""}`}
            </button>
          </div>
        );
      })()}

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
                    {analyzeCost.toFixed(2)}$) o <strong>Analizar todos</strong> arriba para
                    procesar de una vez todos los competidores pendientes.
                  </p>
                )}
                {c.snapshot && !hasUsefulSnapshot(c.snapshot) && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mt-2">
                    Analizado el {new Date(c.snapshot.fetchedAt).toLocaleDateString("es-ES")}, pero
                    DataForSEO no encontró presencia orgánica medible para este dominio (puede ser
                    normal en dominios muy pequeños o nuevos). Cuenta como pendiente en
                    <strong> Analizar todos</strong> por si cambia con el tiempo.
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
              <ContentGapList items={c.contentGap} contentGapAt={c.contentGapAt} projectId={projectId} />
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
