"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type CategoryScore = { score: number; max: number; detail: Record<string, number> };
type CategoryScores = {
  indexabilidad: CategoryScore;
  enlaces: CategoryScore;
  rendimiento: CategoryScore | null;
  accesibilidadImagenes: CategoryScore;
};

type AuditPage = {
  id: string;
  url: string;
  statusCode: number | null;
  isHttps: boolean;
  canonicalUrl: string | null;
  metaRobots: string | null;
  imagesTotal: number;
  imagesMissingAlt: number;
  brokenLinksCount: number;
  inSearchConsole: boolean | null;
  issues: string[] | null;
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

const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  indexabilidad: "Indexabilidad",
  enlaces: "Enlaces",
  rendimiento: "Rendimiento",
  accesibilidadImagenes: "Accesibilidad de imágenes",
};

const ISSUE_LABELS: Record<string, string> = {
  missing_canonical: "Sin canonical",
  noindex: "Marcada noindex",
  no_https: "Sin HTTPS",
  broken_links: "Enlaces rotos",
  missing_alt: "Imágenes sin alt",
  no_gsc_impressions: "Sin impresiones en Search Console (90 días)",
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

export default function AuditoriaView({ projectId }: { projectId: string }) {
  const [history, setHistory] = useState<AuditRun[]>([]);
  const [current, setCurrent] = useState<AuditRun | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState("");
  const [auditFrequency, setAuditFrequency] = useState("manual");
  const [scheduleBusy, setScheduleBusy] = useState(false);
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

  const pagesWithIssues = current?.pages?.filter((p) => (p.issues?.length ?? 0) > 0) ?? [];

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
        <div className="flex items-center gap-2 text-sm bg-gray-50 text-gray-600 px-3 py-2 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          {current.status === "pending" ? "En cola, empezará en breve..." : "Rastreando el sitio..."}
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

      {current?.status === "completed" && !current.robotsBlocked && current.categoryScores && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <ScoreTile label="Puntuación global" score={current.overallScore} max={100} />
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
          </div>
          {!current.categoryScores.rendimiento && (
            <p className="text-xs text-gray-400">
              Rendimiento sin datos (falta configurar PAGESPEED_API_KEY).
            </p>
          )}
          <p className="text-xs text-gray-400">
            Rendimiento medido sobre la página de inicio, no sobre todo el sitio · {current.pagesCrawled}{" "}
            páginas rastreadas
            {current.gscChecked
              ? ""
              : " · sin cruce con Search Console (proyecto sin propiedad GSC o sin conexión de agencia)"}
          </p>

          {pagesWithIssues.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Páginas con incidencias ({pagesWithIssues.length})
              </h3>
              <div className="space-y-2">
                {pagesWithIssues.map((page) => (
                  <div key={page.id} className="border border-gray-100 rounded-lg p-3">
                    <p className="text-sm text-gray-900 truncate">{page.url}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(page.issues ?? []).map((issue) => (
                        <span
                          key={issue}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600"
                        >
                          {ISSUE_LABELS[issue] ?? issue}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
