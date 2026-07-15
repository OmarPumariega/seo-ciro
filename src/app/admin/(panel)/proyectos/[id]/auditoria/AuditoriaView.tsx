"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles, AlertTriangle, XCircle, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import AuditTrendChart from "@/components/admin/AuditTrendChart";
import AuditIssuesTrendChart from "@/components/admin/AuditIssuesTrendChart";
import AuditTechnicalDetails from "@/components/admin/AuditTechnicalDetails";
import AuditIssuesList from "@/components/admin/AuditIssuesList";
import { TECNICA_ISSUES, ONPAGE_ISSUES } from "@/lib/audit/issue-meta";

type CategoryScore = { score: number; max: number; detail: Record<string, number> };
type CategoryScores = {
  indexabilidad: CategoryScore;
  enlaces: CategoryScore;
  onpage: CategoryScore;
  rendimiento: CategoryScore | null;
  accesibilidadImagenes: CategoryScore;
};

type AuditPage = {
  id: string;
  url: string;
  statusCode: number | null;
  isHttps: boolean;
  isRedirect: boolean;
  canonicalUrl: string | null;
  metaRobots: string | null;
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaLength: number | null;
  h1Count: number | null;
  h1Text: string | null;
  imagesTotal: number;
  imagesMissingAlt: number;
  brokenLinksCount: number;
  inSearchConsole: boolean | null;
  issues: string[] | null;
  wordCount: number | null;
};

type AuditRun = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  startUrl: string;
  triggeredAt: string;
  pagesCrawled: number;
  sitemapFound: boolean | null;
  robotsBlocked: boolean;
  overallScore: number | null;
  categoryScores: CategoryScores | null;
  gscChecked: boolean;
  errorMessage: string | null;
  pages?: AuditPage[];
};

type Tab = "resumen" | "tecnica" | "onpage";

const TABS: { key: Tab; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "tecnica", label: "Auditoría Técnica" },
  { key: "onpage", label: "Elementos SEO" },
];

const CATEGORY_LABELS: Record<string, string> = {
  indexabilidad: "Indexabilidad",
  enlaces: "Enlaces",
  onpage: "On-page (títulos/metas/H1)",
  rendimiento: "Rendimiento",
  accesibilidadImagenes: "Accesibilidad",
};

function ScoreTile({ label, score, max }: { label: string; score: number | null; max: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="text-2xl font-semibold text-gray-900">
        {score === null ? "—" : `${score}/${max}`}
      </div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

// Core Web Vitals (PageSpeed Insights). detail viene de scoring.ts:
// { performanceScorePct, lcpMs, clsX1000, inpMs } (-1 = sin dato).
const CWV_TONE: Record<string, string> = { good: "text-emerald-600", warn: "text-amber-600", bad: "text-red-600" };
const CWV_DOT: Record<string, string> = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500" };
const CWV_LABEL: Record<string, string> = { good: "Bueno", warn: "Mejorable", bad: "Lento" };

function CwvTile({ label, value, status }: { label: string; value: string; status: string | null }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums", status ? CWV_TONE[status] : "text-gray-400")}>
        {value}
      </div>
      {status && (
        <div className="flex items-center gap-1 mt-0.5 text-[11px] text-gray-500">
          <span className={cn("h-1.5 w-1.5 rounded-full", CWV_DOT[status])} />
          {CWV_LABEL[status]}
        </div>
      )}
    </div>
  );
}

function CwvPanel({ detail }: { detail: Record<string, number> }) {
  const perf = detail.performanceScorePct;
  const lcp = detail.lcpMs;
  const clsX = detail.clsX1000;
  const inp = detail.inpMs;
  const perfStatus = perf >= 90 ? "good" : perf >= 50 ? "warn" : "bad";
  const lcpStatus = lcp < 0 ? null : lcp <= 2500 ? "good" : lcp <= 4000 ? "warn" : "bad";
  const clsStatus = clsX < 0 ? null : clsX <= 100 ? "good" : clsX <= 250 ? "warn" : "bad";
  const inpStatus = inp < 0 ? null : inp <= 200 ? "good" : inp <= 500 ? "warn" : "bad";

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900">Core Web Vitals (PageSpeed)</h3>
        <span className="text-[10px] uppercase tracking-wide text-gray-400">Home · móvil</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">Medido con Google PageSpeed Insights sobre la página de inicio.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CwvTile label="Performance" value={perf >= 0 ? String(perf) : "—"} status={String(perfStatus)} />
        <CwvTile label="LCP" value={lcp >= 0 ? `${(lcp / 1000).toFixed(1)}s` : "—"} status={lcpStatus} />
        <CwvTile label="CLS" value={clsX >= 0 ? (clsX / 1000).toFixed(2) : "—"} status={clsStatus} />
        <CwvTile label="INP" value={inp >= 0 ? `${inp}ms` : "—"} status={inpStatus} />
      </div>
    </div>
  );
}

function fmtTraffic(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Math.round(v).toLocaleString("es-ES");
}

// Visibilidad del dominio en Google según Search Console (gratis, real). Es la
// alternativa sin coste a una métrica de "autoridad" de pago (Moz/Ahrefs/DataForSEO).
function VisibilityPanel({
  visibility,
  projectId,
}: {
  visibility: { impressions: number; clicks: number; queries: number; position: number; month: string } | null;
  projectId: string;
}) {
  const hasData = visibility && (visibility.impressions > 0 || visibility.queries > 0);
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Visibilidad en Google</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-gray-400">
          {hasData ? `Search Console · ${visibility!.month}` : "Search Console"}
        </span>
      </div>
      {!hasData ? (
        <p className="text-sm text-gray-500">
          Sin datos de Search Console todavía.{" "}
          <Link href={`/admin/proyectos/${projectId}/google`} className="text-brand font-medium underline">
            Conéctalo en el módulo Google →
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiTile label="Impresiones (mes)" value={fmtTraffic(visibility!.impressions)} />
          <KpiTile label="Clics (mes)" value={fmtTraffic(visibility!.clicks)} />
          <KpiTile label="Queries con datos" value={visibility!.queries.toLocaleString("es-ES")} />
          <KpiTile label="Posición media" value={visibility!.position.toFixed(1)} />
        </div>
      )}
    </div>
  );
}

type TopKeyword = { keyword: string; position: number | null; volume: number | null };

// Visibilidad orgánica estimada (DataForSEO Labs) del propio dominio, mismo dato
// que el módulo Competidores — leer el último análisis es gratis, no dispara
// ninguna llamada nueva. Complementa la visibilidad de Search Console (real,
// pero solo cubre lo que Google ya te enseña) con una estimación de mercado que
// también compara contra los competidores trackeados.
function LabsVisibilityPanel({
  snapshot,
  projectId,
}: {
  snapshot: { organicTraffic: number | null; organicKeywords: number | null; topKeywords: TopKeyword[] | null; fetchedAt: string } | null;
  projectId: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Visibilidad orgánica estimada</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-gray-400">
          {snapshot ? `DataForSEO Labs · ${new Date(snapshot.fetchedAt).toLocaleDateString("es-ES")}` : "DataForSEO Labs"}
        </span>
      </div>
      {!snapshot ? (
        <p className="text-sm text-gray-500">
          Sin análisis todavía.{" "}
          <Link href={`/admin/proyectos/${projectId}/competidores`} className="text-brand font-medium underline">
            Analiza tu dominio en Competidores →
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiTile label="Tráfico orgánico (est. mensual)" value={fmtTraffic(snapshot.organicTraffic)} />
            <KpiTile label="Keywords orgánicas" value={snapshot.organicKeywords?.toLocaleString("es-ES") ?? "—"} />
          </div>
          {snapshot.topKeywords && snapshot.topKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {snapshot.topKeywords.slice(0, 10).map((k, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-gray-50 text-gray-600">
                  {k.keyword}
                  {k.position !== null && <span className="text-gray-400">· #{k.position}</span>}
                </span>
              ))}
            </div>
          )}
          <Link href={`/admin/proyectos/${projectId}/competidores`} className="text-xs text-brand font-medium underline">
            Ver todas las keywords y competidores →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function AuditoriaView({ projectId }: { projectId: string }) {
  const [history, setHistory] = useState<AuditRun[]>([]);
  const [current, setCurrent] = useState<AuditRun | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState("");
  const [auditFrequency, setAuditFrequency] = useState("manual");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("resumen");
  // Visibilidad del dominio en Google (Search Console). Gratis: lee el último
  // snapshot persistido por el panel de GSC, sin llamar a la API ni gastar.
  const [visibility, setVisibility] = useState<{
    impressions: number;
    clicks: number;
    queries: number;
    position: number;
    month: string;
  } | null>(null);
  // Visibilidad orgánica estimada (DataForSEO Labs, módulo Competidores).
  // Gratis: lee el último VisibilitySnapshot del dominio del proyecto.
  const [labsSnapshot, setLabsSnapshot] = useState<{
    organicTraffic: number | null;
    organicKeywords: number | null;
    topKeywords: TopKeyword[] | null;
    fetchedAt: string;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function pollRun(auditId: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/proyectos/${projectId}/auditorias/${auditId}`);
      if (!res.ok) return;
      const data: AuditRun = await res.json();
      setCurrent(data);
      setHistory((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      if (data.status === "completed" || data.status === "failed") stopPolling();
    }, 3000);
  }

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/auditorias`)
      .then((r) => r.json())
      .then((data: AuditRun[]) => {
        if (Array.isArray(data)) {
          setHistory(data);
          const latest = data[0];
          if (latest) {
            setCurrent(latest);
            if (latest.status === "pending" || latest.status === "running") {
              pollRun(latest.id);
            } else if (latest.status === "completed") {
              // El listado no incluye `pages` — sin este fetch, las tarjetas
              // KPI y las listas de incidencias se quedarían a 0 hasta que el
              // usuario hiciera clic en el histórico.
              loadDetail(latest.id);
            }
          }
        }
        setLoadingHistory(false);
      });

    // El listado de auditorías no devuelve el proyecto; hacemos un fetch
    // adicional para leer auditFrequency y saber el estado inicial del toggle.
    fetch(`/api/proyectos/${projectId}`)
      .then((r) => r.json())
      .then((p) => {
        if (p && typeof p.auditFrequency === "string") setAuditFrequency(p.auditFrequency);
      })
      .catch(() => {});

    // Visibilidad del dominio (Search Console): lee el último snapshot
    // persistido. Gratis, sin llamadas a la API.
    fetch(`/api/proyectos/${projectId}/google/gsc-snapshot`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.snapshot) {
          setVisibility({
            impressions: d.snapshot.impressions ?? 0,
            clicks: d.snapshot.clicks ?? 0,
            queries: d.snapshot.queries ?? 0,
            position: d.snapshot.position ?? 0,
            month: d.snapshot.month ?? "",
          });
        }
      })
      .catch(() => {});

    // Visibilidad orgánica estimada (DataForSEO Labs): mismo endpoint que lee
    // el módulo Competidores, gratis (solo lee el último snapshot guardado).
    fetch(`/api/proyectos/${projectId}/competidores`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.projectSnapshot) {
          setLabsSnapshot({
            organicTraffic: d.projectSnapshot.organicTraffic ?? null,
            organicKeywords: d.projectSnapshot.organicKeywords ?? null,
            topKeywords: d.projectSnapshot.topKeywords ?? null,
            fetchedAt: d.projectSnapshot.fetchedAt,
          });
        }
      })
      .catch(() => {});

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadDetail(auditId: string) {
    const res = await fetch(`/api/proyectos/${projectId}/auditorias/${auditId}`);
    if (res.ok) setCurrent(await res.json());
  }

  async function handleTrigger() {
    setError("");
    setTriggering(true);
    const res = await fetch(`/api/proyectos/${projectId}/auditorias`, { method: "POST" });
    const data = await res.json();
    setTriggering(false);

    if (!res.ok) {
      setError(data.error ?? "Error al iniciar la auditoría");
      return;
    }

    setHistory((prev) => [data, ...prev]);
    setCurrent(data);
    setTab("resumen");
    pollRun(data.id);
  }

  async function toggleSchedule() {
    const next = auditFrequency === "monthly" ? "manual" : "monthly";
    setScheduleBusy(true);
    setError("");
    const res = await fetch(`/api/proyectos/${projectId}/auditoria/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frequency: next }),
    });
    setScheduleBusy(false);
    if (res.ok) {
      const data = await res.json();
      setAuditFrequency(data.auditFrequency ?? next);
    } else {
      setError("No se pudo actualizar la programación");
    }
  }

  const pages = current?.pages ?? [];
  const pagesWithIssuesCount = pages.filter((p) => (p.issues?.length ?? 0) > 0).length;
  const totalIssueInstances = pages.reduce((sum, p) => sum + (p.issues?.length ?? 0), 0);
  const totalBrokenLinks = pages.reduce((sum, p) => sum + p.brokenLinksCount, 0);

  const showContent =
    current?.status === "completed" && !current.robotsBlocked && current.categoryScores;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Auditoría Técnica</h2>
          <p className="text-sm text-gray-500 mt-1">
            Rastreo del sitio, Core Web Vitals de la home y cruce con Search Console.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <label
            className="flex items-center gap-2 text-xs text-gray-500"
            title="El cron creará una auditoría automáticamente cada ~30 días"
          >
            <span>Auditoría mensual automática</span>
            <button
              type="button"
              role="switch"
              aria-checked={auditFrequency === "monthly"}
              onClick={toggleSchedule}
              disabled={scheduleBusy}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                auditFrequency === "monthly" ? "bg-gray-900" : "bg-gray-200"
              )}
            >
              {scheduleBusy ? (
                <Loader2 className="h-3.5 w-3.5 absolute left-1/2 -translate-x-1/2 text-gray-500 animate-spin" />
              ) : (
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                    auditFrequency === "monthly" ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              )}
            </button>
          </label>
          <button
            onClick={handleTrigger}
            disabled={triggering || current?.status === "pending" || current?.status === "running"}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 shrink-0"
          >
            {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Ejecutar auditoría ahora
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {current && (current.status === "pending" || current.status === "running") && (
        <div className="bg-gray-50 text-gray-600 px-4 py-3 rounded-lg space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            {current.status === "pending"
              ? "En cola — el procesador revisa cada ~60s, empezará en breve."
              : "Rastreando el sitio y consultando PageSpeed..."}
          </div>
          {current.status === "pending" && (
            <p className="text-xs text-gray-500 pl-6">
              Las auditorías se procesan en segundo plano. Espera hasta un minuto
              antes de que cambie a &quot;en curso&quot;.
            </p>
          )}
          {current.status === "running" && (
            <p className="text-xs text-gray-500 pl-6">
              Un análisis completo (rastreo de hasta 50 páginas + PageSpeed de la
              home) puede tardar varios minutos en sitios grandes. No cierres la
              página — los resultados aparecerán aquí automáticamente.
            </p>
          )}
        </div>
      )}

      {current?.status === "failed" && (
        <div className="flex items-center gap-2 text-sm bg-red-50 text-red-600 px-3 py-2 rounded-lg">
          <XCircle className="h-4 w-4 shrink-0" />
          {current.errorMessage ?? "La auditoría ha fallado."}
        </div>
      )}

      {current?.status === "completed" && current.robotsBlocked && (
        <div className="flex items-center gap-2 text-sm bg-amber-50 text-amber-700 px-3 py-2 rounded-lg">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          El robots.txt de este sitio bloquea el rastreo — no se ha podido calcular una
          puntuación.
        </div>
      )}

      {showContent && current && current.categoryScores && (
        <>
          <div className="flex items-center gap-1 border-b border-gray-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === t.key
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "resumen" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KpiTile label="Optimización del sitio" value={`${current.overallScore ?? "—"}%`} />
                <KpiTile label="Páginas rastreadas" value={current.pagesCrawled} />
                <KpiTile label="Páginas con incidencias" value={pagesWithIssuesCount} />
                <KpiTile label="Incidencias totales" value={totalIssueInstances} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {(Object.keys(CATEGORY_LABELS) as (keyof CategoryScores)[]).map((key) => {
                  const cat = current.categoryScores?.[key];
                  return (
                    <ScoreTile
                      key={key}
                      label={CATEGORY_LABELS[key]}
                      score={cat ? cat.score : null}
                      max={cat ? cat.max : 0}
                    />
                  );
                })}
                {/* 6ª casilla del grid 3×2 — no es parte de las 5 categorías
                    puntuadas (no se fabrica una puntuación /100 para no
                    inventar una fórmula), pero es el dato clásico de
                    auditoría técnica que faltaba por resumir: enlaces rotos
                    totales encontrados en todo el rastreo. */}
                <KpiTile label="Enlaces rotos" value={totalBrokenLinks} />
              </div>
              {!current.categoryScores.rendimiento && (
                <p className="text-xs text-gray-400">
                  Rendimiento sin datos (falta configurar PAGESPEED_API_KEY).
                </p>
              )}
              <p className="text-xs text-gray-400">
                Rendimiento medido sobre la página de inicio, no sobre todo el sitio
                {current.gscChecked
                  ? ""
                  : " · sin cruce con Search Console (proyecto sin propiedad GSC o sin conexión de agencia)"}
              </p>

              {/* Core Web Vitals (PageSpeed Insights) — los datos ya los captura el
                  crawl en categoryScores.rendimiento.detail; aquí se muestran. */}
              {current.categoryScores?.rendimiento?.detail && (
                <CwvPanel detail={current.categoryScores.rendimiento.detail} />
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <AuditTrendChart projectId={projectId} />
                <AuditIssuesTrendChart runs={history} />
              </div>

              {/* Visibilidad en Google (Search Console) + visibilidad orgánica
                  estimada (DataForSEO Labs, módulo Competidores) — real vs.
                  estimación de mercado, ambas gratis de ver aquí. */}
              <VisibilityPanel visibility={visibility} projectId={projectId} />
              <LabsVisibilityPanel snapshot={labsSnapshot} projectId={projectId} />
            </div>
          )}

          {tab === "tecnica" && (
            <div className="space-y-6">
              <AuditIssuesList pages={pages} issueCodes={TECNICA_ISSUES} gscChecked={current.gscChecked} />
              <AuditTechnicalDetails projectId={projectId} auditRunId={current.id} />
            </div>
          )}

          {tab === "onpage" && (
            <AuditIssuesList pages={pages} issueCodes={ONPAGE_ISSUES} gscChecked={current.gscChecked} />
          )}
        </>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Histórico</h3>
        {loadingHistory ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no se ha ejecutado ninguna auditoría.</p>
        ) : (
          <div className="space-y-2">
            {history.map((run) => (
              <button
                key={run.id}
                onClick={() => loadDetail(run.id)}
                className={cn(
                  "w-full text-left bg-white rounded-lg border p-3 hover:bg-gray-50 transition-colors",
                  current?.id === run.id ? "border-gray-900" : "border-gray-100"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-900">
                    {new Date(run.triggeredAt).toLocaleString("es-ES")}
                  </span>
                  <span className="text-xs text-gray-400">
                    {run.status === "completed"
                      ? run.robotsBlocked
                        ? "Bloqueada por robots.txt"
                        : `${run.overallScore}/100`
                      : run.status === "failed"
                        ? "Error"
                        : "En curso"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
