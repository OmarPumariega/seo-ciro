"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Rocket, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

// Panel "Re-procesar proyecto": lanza el mismo flujo que el wizard de alta
// (importar keywords del estudio → chequear posición → TF-IDF gratis; analizar
// competidores → content gap), útil para proyectos dados de alta antes de que
// existiera el automatismo, o para reintentar un lanzamiento que se cortó por
// tope de gasto. Idempotente: solo hace lo que falte.

type Estimate = {
  keywordsToCheck: number;
  competitorsToAnalyze: number;
  estimatedCostUsd: number;
  missingDomain: boolean;
};

type Result = {
  keywordsImported: number;
  keywordsChecked: number;
  tfidfGenerated: number;
  competitorsAnalyzed: number;
  contentGapsCalculated: number;
  errors: { step: string; ref: string; message: string }[];
  spendLimitHit: boolean;
};

export default function BootstrapPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  const loadEstimate = useCallback(() => {
    setLoadingEstimate(true);
    fetch(`/api/proyectos/${projectId}/bootstrap`)
      .then((r) => r.json())
      .then((d: Estimate) => setEstimate(d))
      .catch(() => setEstimate(null))
      .finally(() => setLoadingEstimate(false));
  }, [projectId]);

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/bootstrap`)
      .then((r) => r.json())
      .then((d: Estimate) => setEstimate(d))
      .catch(() => setEstimate(null))
      .finally(() => setLoadingEstimate(false));
  }, [projectId]);

  const nothingToDo: boolean =
    !!estimate &&
    !estimate.missingDomain &&
    estimate.keywordsToCheck === 0 &&
    estimate.competitorsToAnalyze === 0;

  async function run() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/proyectos/${projectId}/bootstrap`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al lanzar el análisis");
        return;
      }
      setResult(data as Result);
      // Refresca el estimate y los datos de la página.
      loadEstimate();
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setRunning(false);
      setConfirming(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
          <Rocket className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Lanzar / re-procesar análisis</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Importa las keywords del estudio al Rank Tracking (con chequeo de posición y TF-IDF
            gratis) y analiza todos los competidores (visibilidad + content gap). Útil si el proyecto
            se quedó a medias o si añadiste nuevo material y quieres refrescarlo todo.
          </p>
        </div>
      </div>

      {loadingEstimate ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando…
        </div>
      ) : estimate ? (
        estimate.missingDomain ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
            El proyecto no tiene dominio configurado. Añádelo arriba y guarda antes de lanzar el
            análisis.
          </p>
        ) : nothingToDo ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
            Todo al día: no hay keywords pendientes de importar ni competidores sin analizar.
          </p>
        ) : (
          <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-2.5 space-y-0.5">
            <div>
              <strong className="text-gray-900">{estimate.keywordsToCheck}</strong> keyword
              {estimate.keywordsToCheck === 1 ? "" : "s"} a importar y chequear
            </div>
            <div>
              <strong className="text-gray-900">{estimate.competitorsToAnalyze}</strong> competidor
              {estimate.competitorsToAnalyze === 1 ? "" : "es"} a analizar (visibilidad + content gap)
            </div>
            <div className="text-gray-500 pt-0.5">
              Coste estimado: <strong className="text-gray-700">${estimate.estimatedCostUsd.toFixed(2)}</strong> · El
              coste real es el que devuelve la API.
            </div>
          </div>
        )
      ) : null}

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2.5">{error}</p>}

      {result && (
        <div className="text-xs space-y-1.5 bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-2 font-medium text-gray-900">
            {result.errors.length === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            {result.errors.length === 0 ? "Análisis completado" : "Completado con avisos"}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
            <li>Keywords importadas: <strong className="text-gray-900">{result.keywordsImported}</strong></li>
            <li>Posiciones comprobadas: <strong className="text-gray-900">{result.keywordsChecked}</strong></li>
            <li>TF-IDF generados: <strong className="text-gray-900">{result.tfidfGenerated}</strong></li>
            <li>Competidores analizados: <strong className="text-gray-900">{result.competitorsAnalyzed}</strong></li>
            <li>Content gaps: <strong className="text-gray-900">{result.contentGapsCalculated}</strong></li>
            <li>Errores: <strong className="text-gray-900">{result.errors.length}</strong></li>
          </ul>
          {result.errors.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-red-600">
              {result.errors.slice(0, 5).map((e, i) => (
                <li key={i} className="flex items-start gap-1">
                  <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    <strong>{e.step}</strong> · {e.ref}: {e.message}
                  </span>
                </li>
              ))}
              {result.errors.length > 5 && (
                <li className="text-gray-400">…y {result.errors.length - 5} más</li>
              )}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setConfirming(true)}
          disabled={
            loadingEstimate ||
            running ||
            !!estimate?.missingDomain ||
            (!!estimate && nothingToDo && result === null)
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Lanzar análisis
        </button>
      </div>

      {confirming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <Rocket className="h-5 w-5 text-gray-700" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Lanzar análisis completo</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Se procesarán{" "}
                  <strong className="text-gray-800">{estimate?.keywordsToCheck ?? 0}</strong> keywords
                  (rank tracking + TF-IDF) y{" "}
                  <strong className="text-gray-800">{estimate?.competitorsToAnalyze ?? 0}</strong>{" "}
                  competidores (visibilidad + content gap).
                </p>
                <p className="text-xs text-gray-500 mt-1.5">
                  Coste estimado:{" "}
                  <strong className="text-gray-700">${estimate?.estimatedCostUsd.toFixed(2) ?? "0.00"}</strong>. La
                  operación puede tardar varios segundos. Si se alcanza el tope de gasto, se detendrá
                  y lo procesado quedará guardado.
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirming(false)}
                disabled={running}
                className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={run}
                disabled={running}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Lanzar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
