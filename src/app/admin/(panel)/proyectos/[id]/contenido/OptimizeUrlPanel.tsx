"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, AlertCircle, FileText, History, Wand2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Suggestion = {
  type: "titulo" | "meta" | "h1" | "encabezado" | "contenido";
  location: string;
  current: string | null;
  recommended: string;
  reason: string;
};

type CurrentSnapshot = {
  title: string;
  metaDescription: string;
  h1: string;
  headings: { tag: "h2" | "h3"; text: string }[];
  wordCount: number;
};

type OptimizationRun = {
  id: string;
  url: string;
  targetKeyword: string;
  currentSnapshot: CurrentSnapshot;
  rankPosition: number | null;
  suggestions: Suggestion[];
  model: string;
  createdAt: string;
};

const TYPE_LABEL: Record<Suggestion["type"], string> = {
  titulo: "Título",
  meta: "Meta descripción",
  h1: "H1",
  encabezado: "Encabezado",
  contenido: "Contenido",
};

const TYPE_BADGE: Record<Suggestion["type"], string> = {
  titulo: "bg-indigo-50 text-indigo-700",
  meta: "bg-indigo-50 text-indigo-700",
  h1: "bg-amber-50 text-amber-700",
  encabezado: "bg-amber-50 text-amber-700",
  contenido: "bg-emerald-50 text-emerald-700",
};

export default function OptimizeUrlPanel({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [run, setRun] = useState<OptimizationRun | null>(null);
  const [history, setHistory] = useState<OptimizationRun[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Análisis ya realizados en el proyecto (cualquier URL) — se cargan al
  // montar, sin que el usuario escriba nada, para que el panel nazca ya
  // pintado con lo que existe en BD (mismo patrón que Competidores/Backlinks).
  const [recentRuns, setRecentRuns] = useState<OptimizationRun[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/contenido/optimizar`)
      .then((r) => r.json())
      .then((d: OptimizationRun[]) => Array.isArray(d) && setRecentRuns(d))
      .finally(() => setLoadingRecent(false));
  }, [projectId]);

  // Mientras el usuario escribe la URL, con un pequeño debounce se comprueba
  // si ya existe un análisis para ella y, si lo hay, se autoselecciona el más
  // reciente — sin esperar a que pierda el foco ni a que pulse nada más.
  useEffect(() => {
    const trimmed = url.trim();
    // Todo el setState vive dentro del timeout (async), no en el cuerpo
    // síncrono del efecto — para URL vacía, el "clear" también se difiere.
    const t = setTimeout(() => {
      if (!trimmed) {
        setHistory([]);
        return;
      }
      setLoadingHistory(true);
      fetch(`/api/proyectos/${projectId}/contenido/optimizar?url=${encodeURIComponent(trimmed)}`)
        .then((r) => r.json())
        .then((d: OptimizationRun[]) => {
          if (!Array.isArray(d)) return;
          setHistory(d);
          if (d.length > 0) setRun(d[0]);
        })
        .finally(() => setLoadingHistory(false));
    }, trimmed ? 500 : 0);
    return () => clearTimeout(t);
  }, [url, projectId]);

  function selectRecent(item: OptimizationRun) {
    setUrl(item.url);
    setTargetKeyword(item.targetKeyword);
    setRun(item);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError("");
    setLoading(true);
    setRun(null);
    try {
      const res = await fetch(`/api/proyectos/${projectId}/contenido/optimizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), targetKeyword: targetKeyword.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al optimizar la URL");
        return;
      }
      setRun(data);
      setHistory((prev) => [data, ...prev.filter((h) => h.id !== data.id)]);
      setRecentRuns((prev) => [data, ...prev.filter((h) => h.url !== data.url)]);
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {!loadingRecent && recentRuns.length > 0 && !run && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Análisis recientes del proyecto</h3>
          </div>
          <div className="space-y-2">
            {recentRuns.slice(0, 8).map((h) => (
              <button
                key={h.id}
                onClick={() => selectRecent(h)}
                className="w-full text-left bg-white rounded-lg border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm text-gray-900 truncate">{h.url}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-gray-500">
                    {h.targetKeyword} · {h.suggestions.length} sugerencias
                  </span>
                  <span className="text-xs text-gray-400 shrink-0 ml-2">
                    {new Date(h.createdAt).toLocaleDateString("es-ES")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">URL a optimizar</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.ejemplo.com/servicios/abogados-familia"
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
          <p className="text-xs text-gray-400">
            Se lee el contenido actual de la página y se compara contra el top-10 de Google, tus
            competidores y el estudio de keywords del proyecto.
          </p>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Keyword objetivo <span className="text-gray-400 font-normal">(opcional — se autosugiere si la URL está en Rank Tracking)</span>
          </label>
          <input
            type="text"
            value={targetKeyword}
            onChange={(e) => setTargetKeyword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Optimizar
        </button>
      </form>

      {run && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Estado actual de la página</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-400">Keyword objetivo:</span>{" "}
                <span className="text-gray-900 font-medium">{run.targetKeyword}</span>
              </div>
              <div>
                <span className="text-gray-400">Posición actual:</span>{" "}
                <span className="text-gray-900 font-medium">
                  {run.rankPosition !== null ? run.rankPosition : "sin trackear / fuera de rango"}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-gray-400">Título:</span>{" "}
                <span className="text-gray-900">{run.currentSnapshot.title || "(vacío)"}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-gray-400">H1:</span>{" "}
                <span className="text-gray-900">{run.currentSnapshot.h1 || "(vacío)"}</span>
              </div>
              <div>
                <span className="text-gray-400">Nº palabras:</span>{" "}
                <span className="text-gray-900">{run.currentSnapshot.wordCount}</span>
              </div>
              <div>
                <span className="text-gray-400">Encabezados H2/H3:</span>{" "}
                <span className="text-gray-900">{run.currentSnapshot.headings.length}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Cambios recomendados ({run.suggestions.length})
            </h3>
            {run.suggestions.length === 0 ? (
              <p className="text-sm text-gray-500">
                No se han encontrado cambios claros que recomendar — la página ya cubre bien lo que
                se ha comparado.
              </p>
            ) : (
              <div className="space-y-3">
                {run.suggestions.map((s, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", TYPE_BADGE[s.type])}>
                        {TYPE_LABEL[s.type]}
                      </span>
                      <span className="text-xs text-gray-500">{s.location}</span>
                    </div>
                    {s.current && (
                      <p className="text-sm text-gray-400 line-through">{s.current}</p>
                    )}
                    <p className="text-sm text-gray-900">{s.recommended}</p>
                    <p className="text-xs text-gray-500 flex items-start gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                      {s.reason}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {(loadingHistory || history.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Optimizaciones previas de esta URL</h3>
          </div>
          {loadingHistory ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setRun(h)}
                  className={cn(
                    "w-full text-left bg-white rounded-lg border p-3 hover:bg-gray-50 transition-colors",
                    run?.id === h.id ? "border-gray-900" : "border-gray-100"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-900">
                      {h.targetKeyword} · {h.suggestions.length} sugerencias
                    </p>
                    <span className="text-xs text-gray-400 shrink-0 ml-2 flex items-center gap-1">
                      <Search className="h-3 w-3" /> {new Date(h.createdAt).toLocaleString("es-ES")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
