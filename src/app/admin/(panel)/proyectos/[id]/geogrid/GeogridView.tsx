"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, MapPin, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type GridPoint = { row: number; col: number; lat: number; lng: number; position: number | null; title: string | null };

type GeogridRun = {
  id: string;
  keyword: string;
  gridSize: number;
  radiusKm: number;
  status: "pending" | "running" | "completed" | "failed";
  points: GridPoint[] | null;
  averagePosition: number | null;
  foundCount: number | null;
  errorMessage: string | null;
  triggeredAt: string;
};

// Color de cada celda por posición. Semáforo estándar de geogrids (LocalFalcon
// y similares): verde en top-3, amarillo top-10, naranja top-20, rojo más allá,
// gris si el negocio no aparece en ese punto.
function cellStyle(position: number | null): string {
  if (position === null) return "bg-gray-200 text-gray-400";
  if (position <= 3) return "bg-emerald-500 text-white";
  if (position <= 10) return "bg-amber-400 text-amber-950";
  if (position <= 20) return "bg-orange-400 text-white";
  return "bg-red-500 text-white";
}

const GRID_OPTIONS = [3, 5, 7];

export default function GeogridView({ projectId }: { projectId: string }) {
  const [keyword, setKeyword] = useState("");
  const [gridSize, setGridSize] = useState(5);
  const [radiusKm, setRadiusKm] = useState(3);

  const [history, setHistory] = useState<GeogridRun[]>([]);
  const [current, setCurrent] = useState<GeogridRun | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function pollRun(runId: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/proyectos/${projectId}/geogrid/${runId}`);
      if (!res.ok) return;
      const data: GeogridRun = await res.json();
      setCurrent(data);
      setHistory((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      if (data.status === "completed" || data.status === "failed") stopPolling();
    }, 3000);
  }

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/geogrid`)
      .then((r) => r.json())
      .then((data: GeogridRun[]) => {
        if (Array.isArray(data)) {
          setHistory(data);
          const latest = data[0];
          if (latest) {
            setCurrent(latest);
            if (latest.status === "pending" || latest.status === "running") pollRun(latest.id);
          }
        }
        setLoadingHistory(false);
      });
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadDetail(runId: string) {
    const res = await fetch(`/api/proyectos/${projectId}/geogrid/${runId}`);
    if (res.ok) setCurrent(await res.json());
  }

  async function handleTrigger(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setTriggering(true);
    const res = await fetch(`/api/proyectos/${projectId}/geogrid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, gridSize, radiusKm }),
    });
    const data = await res.json();
    setTriggering(false);
    if (!res.ok) {
      setError(data.error ?? "Error al lanzar el geogrid");
      return;
    }
    setHistory((prev) => [data, ...prev]);
    setCurrent(data);
    pollRun(data.id);
  }

  // Puntos ordenados para pintar la rejilla (row arriba=norte, col izquierda=oeste).
  const points = (current?.points ?? []).slice().sort((a, b) => a.row - b.row || a.col - b.col);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Geogrid Local SEO</h2>
        <p className="text-sm text-gray-500 mt-1">
          Mapa de calor del posicionamiento del negocio en Google Maps alrededor de su ubicación,
          para una keyword. Una rejilla 5×5 son 25 consultas a Maps SERP (~75s, procesadas en segundo
          plano).
        </p>
      </div>

      <form onSubmit={handleTrigger} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Keyword</label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="dentista madrid"
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Rejilla</label>
            <div className="flex gap-2">
              {GRID_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setGridSize(n)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm font-medium border",
                    gridSize === n ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {n}×{n}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Radio (km)</label>
            <input
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          {gridSize * gridSize} consultas · coste estimado ~${(gridSize * gridSize * 0.002).toFixed(2)}
        </p>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={triggering || current?.status === "pending" || current?.status === "running"}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Ejecutar geogrid
        </button>
      </form>

      {(current?.status === "pending" || current?.status === "running") && (
        <div className="flex items-center gap-2 text-sm bg-gray-50 text-gray-600 px-3 py-2 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          {current.status === "pending"
            ? "En cola, empezará en breve (el cron lo procesa cada 60s)..."
            : `Rastreando rejilla ${current.gridSize}×${current.gridSize} (${current.keyword})...`}
        </div>
      )}

      {current?.status === "failed" && (
        <div className="flex items-center gap-2 text-sm bg-red-50 text-red-600 px-3 py-2 rounded-lg">
          <XCircle className="h-4 w-4 shrink-0" />
          {current.errorMessage ?? "El geogrid ha fallado."}
        </div>
      )}

      {current?.status === "completed" && current.points && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {current.keyword} · {current.gridSize}×{current.gridSize} · radio {current.radiusKm} km
              </p>
              <p className="text-xs text-gray-400">
                {current.foundCount ?? 0}/{current.gridSize * current.gridSize} puntos posicionando
                {current.averagePosition !== null && <> · media #{current.averagePosition}</>}
              </p>
            </div>
          </div>

          {/* Heatmap */}
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${current.gridSize}, minmax(0, 1fr))` }}
          >
            {points.map((p, i) => (
              <div
                key={i}
                title={p.position === null ? "No aparece en este punto" : `#${p.position}${p.title ? " · " + p.title : ""}`}
                className={cn(
                  "aspect-square rounded-md flex items-center justify-center text-xs font-semibold",
                  cellStyle(p.position)
                )}
              >
                {p.position === null ? "—" : `#${p.position}`}
              </div>
            ))}
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" /> Top 3</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-400" /> 4–10</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-orange-400" /> 11–20</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-500" /> +20</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-gray-200" /> No aparece</span>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Histórico</h3>
        {loadingHistory ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no se ha ejecutado ningún geogrid.</p>
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
                  <span className="text-sm text-gray-900 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    {run.keyword}
                  </span>
                  <span className="text-xs text-gray-400">
                    {run.status === "completed"
                      ? `${run.gridSize}×${run.gridSize} · ${run.foundCount ?? 0}/${run.gridSize * run.gridSize}`
                      : run.status === "failed"
                        ? "Error"
                        : "En curso"}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{new Date(run.triggeredAt).toLocaleString("es-ES")}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
