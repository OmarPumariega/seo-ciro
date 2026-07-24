"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, XCircle, GitCompareArrows, Check, MapPin, Star, MousePointerClick, Trash2, Search, Send, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { geogridCostUsd, geogridBusinessKeywordsCostUsd } from "@/lib/dataforseo/pricing";
import { importKeywordsToNewStudy } from "@/lib/keywords/client-import";
import GeogridMap from "@/components/admin/GeogridMap";
import UrlLink from "@/components/admin/UrlLink";
import GbpPicker, { type GbpCandidate } from "@/components/admin/GbpPicker";
import type { MapsTopItem } from "@/lib/geogrid/maps";

// Item devuelto por "Ver keywords" — mismo shape que RankedKeyword de
// Competidores (mismo endpoint, incluida la dificultad real).
type BusinessKeyword = {
  keyword: string;
  position: number | null;
  volume: number | null;
  competition: string | null;
  cpc: number | null;
  monthlySearches: number[] | null;
  difficulty: number | null;
};

type GridPoint = {
  row: number;
  col: number;
  lat: number;
  lng: number;
  position: number | null;
  title: string | null;
  url?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  category?: string | null;
  address?: string | null;
  placeId?: string | null;
  domain?: string | null;
  top?: MapsTopItem[];
};

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

// Mismo semáforo que cellStyle pero como color plano, para la insignia
// numerada del ranking local (fondo de color + número en blanco).
function badgeColor(position: number): string {
  if (position <= 3) return "bg-emerald-500";
  if (position <= 10) return "bg-amber-500";
  if (position <= 20) return "bg-orange-400";
  return "bg-red-500";
}

// Tabla de keywords de un negocio (mismo detalle que Competidores: volumen,
// posición, CPC, dificultad real) + botón para importarlas a un estudio de
// Keywords, sin coste adicional (los datos ya se pagaron al pedirlas aquí).
function BusinessKeywordsTable({
  projectId,
  domain,
  items,
}: {
  projectId: string;
  domain: string;
  items: BusinessKeyword[];
}) {
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");

  async function handleImport() {
    setImporting(true);
    const result = await importKeywordsToNewStudy(
      projectId,
      `Geogrid: ${domain} — ${new Date().toLocaleDateString("es-ES")}`,
      items,
    );
    setImporting(false);
    setNotice(result.ok ? `Estudio creado con ${result.added} keywords.` : result.error);
    setTimeout(() => setNotice(""), 5000);
  }

  if (items.length === 0) {
    return <p className="text-xs text-gray-400 py-1">Sin keywords orgánicas encontradas para este dominio.</p>;
  }

  return (
    <div className="mt-1.5 mb-1 bg-gray-50 rounded-lg p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500">{items.length} keywords</p>
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1 text-[11px] font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
        >
          {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Importar a estudio
        </button>
      </div>
      {notice && <p className="text-[11px] text-emerald-700">{notice}</p>}
      <div className="max-h-40 overflow-y-auto space-y-1">
        {items.slice(0, 50).map((k, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-gray-700 truncate">{k.keyword}</span>
            <span className="text-gray-400 shrink-0 tabular-nums">
              {k.volume != null ? k.volume.toLocaleString("es-ES") : "—"}
              {k.position != null && ` · #${k.position}`}
              {k.difficulty != null && ` · dif. ${k.difficulty}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Panel lateral "quién gana aquí" (estilo LocalFalcon/DinoRank): el pack
// local real de un punto concreto de la rejilla, con valoración y web —
// mismos datos que ya trae la llamada pagada de ese punto, no cuesta nada
// nuevo mostrarlos. "Ver keywords" es la única acción de este panel que
// gasta (bajo demanda, por negocio con dominio resuelto).
function PointRankingPanel({
  point,
  projectId,
  runId,
}: {
  point: GridPoint | null;
  projectId: string;
  runId: string | null;
}) {
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [keywordsByDomain, setKeywordsByDomain] = useState<Record<string, BusinessKeyword[]>>({});
  const [loadingDomain, setLoadingDomain] = useState<string | null>(null);
  const [kwError, setKwError] = useState("");

  async function toggleKeywords(domain: string) {
    if (expandedDomain === domain) {
      setExpandedDomain(null);
      return;
    }
    setExpandedDomain(domain);
    setKwError("");
    if (keywordsByDomain[domain] || !runId) return; // ya en caché de esta sesión
    setLoadingDomain(domain);
    const res = await fetch(`/api/proyectos/${projectId}/geogrid/${runId}/keywords-negocio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    const data = await res.json();
    setLoadingDomain(null);
    if (!res.ok) {
      setKwError(data.error ?? "Error al buscar las keywords");
      return;
    }
    setKeywordsByDomain((prev) => ({ ...prev, [domain]: data.items }));
  }

  if (!point) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-gray-400 py-10">
        <MousePointerClick className="h-5 w-5" />
        <p className="text-xs">Haz clic en un punto del mapa para ver quién gana el pack local ahí.</p>
      </div>
    );
  }
  const top = point.top ?? [];
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-400 mb-2">
        Punto ({point.row + 1},{point.col + 1}) ·{" "}
        {point.position === null ? "no aparece aquí" : `tú vas #${point.position}`}
      </p>
      {top.length === 0 ? (
        <p className="text-sm text-gray-500">Sin negocios detectados en este punto.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {top.map((item) => (
            <li
              key={item.position}
              className={cn("py-2 flex gap-2 rounded-md", item.isMatch && "bg-emerald-50 -mx-2 px-2")}
            >
              <span
                className={cn(
                  "h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white mt-0.5",
                  badgeColor(item.position)
                )}
              >
                {item.position}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.title}
                  {item.isMatch && <span className="ml-1 text-[10px] font-semibold text-emerald-700">· TÚ</span>}
                </p>
                <p className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                  {item.rating !== null ? (
                    <span className="flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {item.rating.toFixed(1)}/5.0{item.reviewsCount !== null && ` (${item.reviewsCount})`}
                    </span>
                  ) : (
                    <span className="text-gray-400">Sin valoraciones</span>
                  )}
                  {item.category && <span className="text-gray-400">· {item.category}</span>}
                </p>
                {item.address && <p className="text-[11px] text-gray-400 truncate">{item.address}</p>}
                <div className="flex items-center gap-2 mt-0.5">
                  {item.url && <UrlLink url={item.url} className="text-xs" />}
                  {item.domain && (
                    <button
                      onClick={() => toggleKeywords(item.domain as string)}
                      className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 shrink-0"
                      title={`Ver keywords de ${item.domain} (~$${geogridBusinessKeywordsCostUsd().toFixed(2)})`}
                    >
                      {loadingDomain === item.domain ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Search className="h-3 w-3" />
                      )}
                      Ver keywords
                    </button>
                  )}
                </div>
                {expandedDomain === item.domain && item.domain && (
                  <>
                    {kwError && <p className="text-[11px] text-red-600 mt-1">{kwError}</p>}
                    {keywordsByDomain[item.domain] && (
                      <BusinessKeywordsTable projectId={projectId} domain={item.domain} items={keywordsByDomain[item.domain]} />
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Resumen agregado "quién gana en toda la rejilla": no solo el punto
// seleccionado, sino cuántos puntos del run entero gana cada competidor y su
// posición media — agrupado por placeId (más fiable que el título) sobre
// datos ya guardados, sin coste adicional.
function GridWinnersSummary({ points, gridSize }: { points: GridPoint[]; gridSize: number }) {
  const totals = points.length;
  const byBusiness = new Map<
    string,
    { title: string; rating: number | null; points: number; posSum: number; isMatch: boolean }
  >();
  for (const p of points) {
    for (const item of p.top ?? []) {
      const key = item.placeId || item.title;
      const cur = byBusiness.get(key) ?? { title: item.title, rating: item.rating, points: 0, posSum: 0, isMatch: item.isMatch };
      cur.points += 1;
      cur.posSum += item.position;
      byBusiness.set(key, cur);
    }
  }
  const ranked = [...byBusiness.values()]
    .map((b) => ({ ...b, avgPosition: Math.round((b.posSum / b.points) * 10) / 10 }))
    .sort((a, b) => b.points - a.points || a.avgPosition - b.avgPosition)
    .slice(0, 10);

  if (ranked.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Quién gana en toda la rejilla</h3>
      </div>
      <p className="text-xs text-gray-400">
        En cuántos de los {totals} puntos ({gridSize}×{gridSize}) aparece cada negocio, y su posición
        media — calculado sobre los datos ya guardados de este geogrid, sin coste adicional.
      </p>
      <ul className="divide-y divide-gray-50">
        {ranked.map((b, i) => (
          <li key={i} className={cn("py-2 flex items-center justify-between gap-2", b.isMatch && "bg-emerald-50 -mx-2 px-2 rounded-md")}>
            <span className="text-sm text-gray-900 truncate flex items-center gap-1.5">
              {b.title}
              {b.isMatch && <span className="text-[10px] font-semibold text-emerald-700">· TÚ</span>}
            </span>
            <span className="text-xs text-gray-500 shrink-0 tabular-nums">
              {b.points}/{totals} puntos · media #{b.avgPosition}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
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

export default function GeogridView({
  projectId,
  centerLat: initialLat,
  centerLng: initialLng,
  businessName: initialBusinessName,
  gbpName: initialGbpName,
  gbpPlaceId: initialGbpPlaceId,
}: {
  projectId: string;
  centerLat: number | null;
  centerLng: number | null;
  businessName: string | null;
  gbpName: string | null;
  gbpPlaceId: string | null;
}) {
  // Estado local (no solo props): al elegir una ficha de Google con
  // GbpPicker, el centro del mapa y el nombre deben actualizarse al
  // instante sin recargar la página — la fuente inicial es el proyecto,
  // pero a partir de ahí manda lo que el usuario elija en esta sesión.
  const [centerLat, setCenterLat] = useState(initialLat);
  const [centerLng, setCenterLng] = useState(initialLng);
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [gbpName, setGbpName] = useState(initialGbpName);
  const [gbpPlaceId, setGbpPlaceId] = useState(initialGbpPlaceId);

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
  const [selectedPoint, setSelectedPoint] = useState<{ row: number; col: number } | null>(null);
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

  // Selección por defecto en el mapa: el punto donde mejor posiciona el
  // negocio (o el primero si no aparece en ninguno) — así el panel lateral
  // nunca arranca vacío al cargar un run ya completado. Ajuste de estado
  // durante el render (no dentro de un effect), como recomienda
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-based-on-a-prop-change
  const [selectedPointForRunId, setSelectedPointForRunId] = useState(current?.id);
  if (current?.id !== selectedPointForRunId) {
    setSelectedPointForRunId(current?.id);
    if (current?.status !== "completed" || !current.points || current.points.length === 0) {
      setSelectedPoint(null);
    } else {
      const points = sortPoints(current.points);
      const withPosition = points.filter((p) => p.position !== null);
      const best = withPosition.length > 0
        ? withPosition.reduce((a, b) => ((a.position as number) <= (b.position as number) ? a : b))
        : points[0];
      setSelectedPoint({ row: best.row, col: best.col });
    }
  }

  async function loadDetail(runId: string) {
    const res = await fetch(`/api/proyectos/${projectId}/geogrid/${runId}`);
    if (res.ok) setCurrent(await res.json());
  }

  // Borra un geogrid del historial. Si era el current, sustituye por el
  // siguiente disponible (o null si no quedan). El endpoint bloquea el
  // borrado de runs pending/running (409) — aquí lo mostramos como error.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  async function handleDelete(runId: string, keyword: string) {
    if (!window.confirm(`¿Borrar el geogrid de «${keyword}»? No se puede deshacer.`)) return;
    setDeletingId(runId);
    setError("");
    try {
      const res = await fetch(`/api/proyectos/${projectId}/geogrid/${runId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error al borrar el geogrid");
        return;
      }
      setHistory((prev) => {
        const next = prev.filter((r) => r.id !== runId);
        // Si era el current, saltamos al siguiente disponible (o null).
        setCurrent((cur) => {
          if (cur?.id !== runId) return cur;
          return next[0] ?? null;
        });
        return next;
      });
    } finally {
      setDeletingId(null);
    }
  }

  function handleGbpApplied(c: GbpCandidate) {
    setGbpPlaceId(c.placeId);
    setGbpName(c.title);
    if (c.lat !== null) setCenterLat(c.lat);
    if (c.lng !== null) setCenterLng(c.lng);
    if (!businessName) setBusinessName(c.title);
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

  const selectedPointData: GridPoint | null =
    selectedPoint && current?.points
      ? current.points.find((p) => p.row === selectedPoint.row && p.col === selectedPoint.col) ?? null
      : null;

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

      {/* Mapa real (Leaflet/OSM), siempre visible desde el centro del negocio
          aunque todavía no haya ningún geogrid ejecutado, con un círculo
          numerado por punto (mismo lenguaje visual que LocalFalcon/DinoRank)
          y un panel lateral con el pack local real del punto seleccionado. */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-500" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {current?.status === "completed" ? current.keyword : businessName ?? "Centro del negocio"}
            </h3>
            {current?.status === "completed" && !canCompare && (
              <p className="text-xs text-gray-400">
                {current.gridSize}×{current.gridSize} · radio {current.radiusKm} km ·{" "}
                {current.foundCount ?? 0}/{current.gridSize * current.gridSize} puntos posicionando
                {current.averagePosition !== null && <> · media #{current.averagePosition}</>}
                {" · "}{new Date(current.triggeredAt).toLocaleDateString("es-ES")}
              </p>
            )}
          </div>
        </div>

        {centerLat === null || centerLng === null ? (
          <p className="text-sm text-gray-500">
            Faltan las coordenadas del negocio — defínelas en la ficha del proyecto para ver el mapa
            y poder ejecutar un geogrid.
          </p>
        ) : (
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 min-w-0">
              <GeogridMap
                centerLat={centerLat}
                centerLng={centerLng}
                radiusKm={current?.status === "completed" ? current.radiusKm : radiusKm}
                points={current?.status === "completed" ? current.points : null}
                keyword={current?.status === "completed" ? current.keyword : undefined}
                selected={selectedPoint}
                onSelectPoint={(p) => setSelectedPoint({ row: p.row, col: p.col })}
              />
            </div>
            <div className="lg:w-72 shrink-0 lg:border-l lg:border-gray-100 lg:pl-4">
              <PointRankingPanel point={selectedPointData} projectId={projectId} runId={current?.id ?? null} />
            </div>
          </div>
        )}

        {current?.status === "completed" && current.points && !canCompare && (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 pt-1">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Top 3</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-500" /> 4–10</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-orange-400" /> 11–20</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-red-500" /> +20</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-gray-400" /> No aparece</span>
          </div>
        )}
      </div>

      {current?.status === "completed" && current.points && !canCompare && (
        <GridWinnersSummary points={current.points} gridSize={current.gridSize} />
      )}

      <form onSubmit={handleTrigger} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <GbpPicker
          projectId={projectId}
          currentGbpName={gbpName}
          currentPlaceId={gbpPlaceId}
          onApplied={handleGbpApplied}
        />

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
                  {!compareMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(run.id, run.keyword);
                      }}
                      disabled={
                        deletingId === run.id ||
                        run.status === "pending" ||
                        run.status === "running"
                      }
                      className="p-1 text-gray-300 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      title={
                        run.status === "pending" || run.status === "running"
                          ? "No se puede borrar mientras se está procesando"
                          : "Borrar geogrid"
                      }
                    >
                      {deletingId === run.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
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
