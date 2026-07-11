"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, XCircle, GitCompareArrows, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { geogridCostUsd } from "@/lib/dataforseo/pricing";

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

function sortPoints(points: GridPoint[] | null): GridPoint[] {
  return (points ?? []).slice().sort((a, b) => a.row - b.row || a.col - b.col);
}

// Heatmap reutilizable: pinta la rejilla N×N de un run (o de una comparación).
function Heatmap({ run, compact = false }: { run: { gridSize: number; points: GridPoint[] | null }; compact?: boolean }) {
  const points = sortPoints(run.points);
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${run.gridSize}, minmax(0, 1fr))` }}>
      {points.map((p, i) => (
        <div
          key={i}
          title={p.position === null ? "No aparece en este punto" : `#${p.position}${p.title ? " · " + p.title : ""}`}
          className={cn(
            "aspect-square rounded-md flex items-center justify-center font-semibold",
            compact ? "text-[10px]" : "text-xs",
            cellStyle(p.position)
          )}
        >
          {p.position === null ? "—" : `#${p.position}`}
        </div>
      ))}
    </div>
  );
}

// Color del delta entre dos runs (A=antes, B=después). Devuelve clase + texto.
function deltaStyle(posA: number | null, posB: number | null): { cls: string; label: string } {
  if (posA === null && posB === null) return { cls: "bg-gray-100 text-gray-300", label: "—" };
  if (posA === null && posB !== null) return { cls: "bg-emerald-300 text-emerald-950", label: `#${posB} ✓` }; // apareció
  if (posA !== null && posB === null) return { cls: "bg-red-700 text-white", label: "perdido" }; // desapareció
  if (posA !== null && posB !== null) {
    if (posB < posA) return { cls: "bg-emerald-500 text-white", label: `#${posB} ▼${posA - posB}` }; // mejoró
    if (posB > posA) return { cls: "bg-red-500 text-white", label: `#${posB} ▲${posB - posA}` }; // empeoró
    return { cls: "bg-gray-300 text-gray-600", label: `#${posB} =` }; // igual
  }
  return { cls: "bg-gray-100 text-gray-300", label: "—" };
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
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
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

  // Delta de posición media de un run vs el anterior de la misma keyword.
  function avgDelta(run: GeogridRun): { improved: boolean; worsened: boolean; diff: number } | null {
    if (run.averagePosition === null) return null;
    const idx = history.findIndex((r) => r.id === run.id);
    // history va de nuevo a viejo: el "anterior" (más viejo) es el siguiente con misma keyword.
    for (let j = idx + 1; j < history.length; j++) {
      if (history[j].keyword === run.keyword && history[j].averagePosition !== null) {
        const diff = history[j].averagePosition! - run.averagePosition!; // >0 = mejoró (bajó el nº)
        return { improved: diff > 0, worsened: diff < 0, diff: Math.abs(diff) };
      }
    }
    return null;
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  const compareRuns = compareIds
    .map((id) => history.find((r) => r.id === id))
    .filter((r): r is GeogridRun => !!r);
  // La comparación solo es coherente si misma keyword + mismo gridSize.
  const canCompare =
    compareRuns.length === 2 &&
    compareRuns[0].keyword === compareRuns[1].keyword &&
    compareRuns[0].gridSize === compareRuns[1].gridSize &&
    compareRuns.every((r) => r.status === "completed" && r.points);
  // Ordenar: antes (más viejo) primero, después (más nuevo) segundo.
  const [runBefore, runAfter] = [...compareRuns].sort(
    (a, b) => new Date(a.triggeredAt).getTime() - new Date(b.triggeredAt).getTime()
  );

  // Delta por celda entre los dos runs comparados.
  let deltaCells: { posA: number | null; posB: number | null }[] = [];
  if (canCompare && runBefore && runAfter) {
    const mapA = new Map(sortPoints(runBefore.points).map((p) => [`${p.row},${p.col}`, p.position]));
    deltaCells = sortPoints(runAfter.points).map((p) => ({
      posA: mapA.get(`${p.row},${p.col}`) ?? null,
      posB: p.position,
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Geogrid Local SEO</h2>
        <p className="text-sm text-gray-500 mt-1">
          Mapa de calor del posicionamiento del negocio en Google Maps. Cada geogrid se guarda como
          una instantánea independiente — lanza uno hoy y otro dentro de un mes para ver la evolución
          (y compararlos lado a lado). Una rejilla 5×5 son 25 consultas a Maps SERP (~75s).
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
          {gridSize * gridSize} consultas · coste estimado ~${geogridCostUsd(gridSize).toFixed(2)} por escaneo
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

      {current?.status === "completed" && current.points && !canCompare && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {current.keyword} · {current.gridSize}×{current.gridSize} · radio {current.radiusKm} km
              </p>
              <p className="text-xs text-gray-400">
                {current.foundCount ?? 0}/{current.gridSize * current.gridSize} puntos posicionando
                {current.averagePosition !== null && <> · media #{current.averagePosition}</>}
                {" · "}{new Date(current.triggeredAt).toLocaleDateString("es-ES")}
              </p>
            </div>
          </div>
          <Heatmap run={current} />
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" /> Top 3</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-400" /> 4–10</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-orange-400" /> 11–20</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-500" /> +20</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-gray-200" /> No aparece</span>
          </div>
        </div>
      )}

      {canCompare && runBefore && runAfter && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Comparación · {runAfter.keyword}
              </p>
              <p className="text-xs text-gray-400">
                {new Date(runBefore.triggeredAt).toLocaleDateString("es-ES")} →{" "}
                {new Date(runAfter.triggeredAt).toLocaleDateString("es-ES")}
              </p>
            </div>
            <button
              onClick={() => setCompareIds([])}
              className="text-xs text-gray-400 hover:text-gray-900"
            >
              Cerrar
            </button>
          </div>

          {/* Grid de deltas: el progreso por celda */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Cambios por punto</p>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${runAfter.gridSize}, minmax(0, 1fr))` }}>
              {deltaCells.map((c, i) => {
                const d = deltaStyle(c.posA, c.posB);
                return (
                  <div
                    key={i}
                    title={`Antes: ${c.posA === null ? "—" : "#" + c.posA} · Después: ${c.posB === null ? "—" : "#" + c.posB}`}
                    className={cn("aspect-square rounded-md flex items-center justify-center text-[10px] font-semibold", d.cls)}
                  >
                    {d.label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Los dos mapas lado a lado */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[11px] text-gray-400">Antes · {new Date(runBefore.triggeredAt).toLocaleDateString("es-ES")}</p>
              <Heatmap run={runBefore} compact />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-gray-400">Después · {new Date(runAfter.triggeredAt).toLocaleDateString("es-ES")}</p>
              <Heatmap run={runAfter} compact />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" /> Mejoró</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-300" /> Apareció</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-500" /> Empeoró</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-700" /> Perdido</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-gray-300" /> Igual</span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Histórico</h3>
          {history.filter((r) => r.status === "completed").length >= 2 && (
            <button
              onClick={() => {
                setCompareMode((v) => !v);
                setCompareIds([]);
              }}
              className={cn(
                "flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border",
                compareMode ? "bg-gray-900 text-white border-gray-900" : "text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              <GitCompareArrows className="h-3.5 w-3.5" />
              {compareMode ? "Salir de comparación" : "Comparar"}
            </button>
          )}
        </div>

        {loadingHistory ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no se ha ejecutado ningún geogrid.</p>
        ) : (
          <div className="space-y-2">
            {history.map((run) => {
              const delta = avgDelta(run);
              const selected = compareIds.includes(run.id);
              const completed = run.status === "completed";
              return (
                <div
                  key={run.id}
                  className={cn(
                    "bg-white rounded-lg border p-3 flex items-center gap-3",
                    current?.id === run.id ? "border-gray-900" : "border-gray-100",
                    selected && compareMode && "ring-1 ring-gray-900"
                  )}
                >
                  {compareMode && completed && (
                    <button
                      onClick={() => toggleCompare(run.id)}
                      className={cn(
                        "h-5 w-5 rounded border flex items-center justify-center shrink-0",
                        selected ? "bg-gray-900 border-gray-900 text-white" : "border-gray-300"
                      )}
                      aria-label="Seleccionar para comparar"
                    >
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <button onClick={() => !compareMode && loadDetail(run.id)} className="text-left min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900 truncate">{run.keyword}</span>
                      {delta && (
                        <span className={cn("text-[11px] font-medium", delta.improved ? "text-emerald-600" : delta.worsened ? "text-red-600" : "text-gray-400")}>
                          {delta.improved ? "▼" : delta.worsened ? "▲" : "="}{delta.diff}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(run.triggeredAt).toLocaleDateString("es-ES")}
                      {completed && (
                        <> · {run.gridSize}×{run.gridSize} · {run.foundCount ?? 0}/{run.gridSize * run.gridSize} puntos
                          {run.averagePosition !== null && ` · media #${run.averagePosition}`}</>
                      )}
                      {run.status === "failed" && " · error"}
                      {(run.status === "pending" || run.status === "running") && " · en curso"}
                    </p>
                  </button>
                  {compareMode && compareIds.length === 2 && !canCompare && selected && (
                    <span className="text-[10px] text-amber-600 max-w-[120px] text-right">
                      Misma keyword y rejilla para comparar
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {compareMode && compareIds.length < 2 && (
          <p className="text-xs text-gray-400">Selecciona 2 geogrids de la misma keyword y rejilla para compararlos.</p>
        )}
      </div>
    </div>
  );
}
