"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ArrowUp, ArrowDown, Minus, Sparkles, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Panel de Search Console ampliado. Periodo configurable (28d/3m/6m/12m),
// top queries y top páginas con "ver más", desgloses por dispositivo y país,
// evolución mensual y cruce con el Módulo 1 (importar queries). Cada apertura
// persiste un snapshot en BD (dedupe por mes) que leen el Copilot y otros
// módulos. Todos los datos vienen de la API de Search Console.

type GscTotals = { clicks: number; impressions: number; ctr: number; position: number };
type GscQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prevPosition: number | null;
};
type GscPageRow = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prevPosition: number | null;
};
type GscBreakdownRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };
type GscMonthPoint = { month: string; clicks: number; impressions: number };
type GscDetail = {
  rangeKey: string;
  rangeDays: number;
  totals: GscTotals;
  topQueries: GscQueryRow[];
  topPages: GscPageRow[];
  byDevice: GscBreakdownRow[];
  byCountry: GscBreakdownRow[];
  timeseries: GscMonthPoint[];
};

const RANGE_OPTIONS: { key: string; label: string }[] = [
  { key: "28d", label: "28 días" },
  { key: "3m", label: "3 meses" },
  { key: "6m", label: "6 meses" },
  { key: "12m", label: "12 meses" },
];

type SortKey = "clicks" | "impressions" | "ctr" | "position";
type SortDir = "asc" | "desc";

// Compara filas de query/página por la métrica elegida. Posición: menor = mejor
// (ascendente por defecto al clicar); el resto: mayor = más (descendente).
function compareRows(a: { clicks: number; impressions: number; ctr: number; position: number }, b: typeof a, key: SortKey): number {
  if (key === "position") return (a.position || 999) - (b.position || 999);
  return (b[key] ?? 0) - (a[key] ?? 0);
}
function sortRows<T extends { clicks: number; impressions: number; ctr: number; position: number }>(rows: T[], sort: { key: SortKey; dir: SortDir }): T[] {
  const sorted = [...rows].sort((a, b) => compareRows(a, b, sort.key));
  return sort.dir === "asc" && sort.key !== "position" ? sorted.reverse() : sort.dir === "desc" && sort.key === "position" ? sorted.reverse() : sorted;
}

const SORT_COLS: { key: SortKey; label: string }[] = [
  { key: "clicks", label: "Clics" },
  { key: "impressions", label: "Imp." },
  { key: "ctr", label: "CTR" },
  { key: "position", label: "Pos." },
];

function SortTh({
  col,
  sort,
  onSort,
}: {
  col: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === col;
  return (
    <th
      className={cn("py-1.5 pr-3 font-medium text-right cursor-pointer select-none whitespace-nowrap", active ? "text-gray-900" : "text-gray-400 hover:text-gray-700")}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {SORT_COLS.find((c) => c.key === col)?.label}
        <span className="text-[9px]">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </span>
    </th>
  );
}

const QUERIES_INITIAL = 25;
const PAGES_INITIAL = 10;
const IMPORT_LIMIT = 30;

const DEVICE_LABEL: Record<string, string> = {
  MOBILE: "Móvil",
  DESKTOP: "Escritorio",
  TABLET: "Tablet",
};

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("es-ES");
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function fmtPos(n: number): string {
  return n.toFixed(1);
}
function monthLabel(ym: string): string {
  const [, m] = ym.split("-");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return months[Number(m) - 1] ?? m;
}
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname + u.search;
    return p === "/" ? `/ (${u.host})` : p;
  } catch {
    return url;
  }
}

function PositionTrend({ current, prev }: { current: number; prev: number | null }) {
  if (prev == null) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">—</span>;
  }
  const delta = prev - current;
  if (Math.abs(delta) < 0.1) {
    return <Minus className="inline h-3 w-3 text-gray-400" />;
  }
  const improved = delta > 0;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs", improved ? "text-emerald-600" : "text-red-500")}
      title={`Periodo anterior: posición ${prev.toFixed(1)}`}
    >
      {improved ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function MonthlyChart({ points }: { points: GscMonthPoint[] }) {
  const [metric, setMetric] = useState<"clicks" | "impressions">("clicks");
  if (points.length === 0) {
    return <p className="text-sm text-gray-500">Sin datos suficientes para la evolución.</p>;
  }
  const max = Math.max(...points.map((p) => p[metric]), 1);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(["clicks", "impressions"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium border",
              metric === m ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            {m === "clicks" ? "Clics" : "Impresiones"}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-1.5 h-36">
        {points.map((p) => {
          // Altura en píxeles absolutos (no %): las columnas tienen altura
          // automática por el items-end del contenedor, así que un `height: X%`
          // colapsaba y las barras no se veían.
          const h = Math.max(2, Math.round((p[metric] / max) * 116));
          return (
            <div key={p.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div
                className={cn("w-full rounded-t", metric === "clicks" ? "bg-gray-800" : "bg-gray-400")}
                style={{ height: `${h}px` }}
                title={`${monthLabel(p.month)}: ${fmtInt(p[metric])} ${metric === "clicks" ? "clics" : "impresiones"}`}
              />
              <span className="text-[9px] text-gray-400 truncate w-full text-center">{monthLabel(p.month)}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400">Evolución de los últimos 12 meses (independiente del periodo seleccionado).</p>
    </div>
  );
}

export default function GscPanel({ projectId }: { projectId: string }) {
  const [range, setRange] = useState("3m");
  const [data, setData] = useState<GscDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllQueries, setShowAllQueries] = useState(false);
  const [showAllPages, setShowAllPages] = useState(false);
  const [qSort, setQSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "clicks", dir: "desc" });
  const [pSort, setPSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "clicks", dir: "desc" });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/google/search-console?range=${range}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Error al cargar los datos de Search Console");
        }
        return r.json();
      })
      .then((d: GscDetail) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId, range]);

  // Al cambiar de periodo: recarga + resetea los "ver más". Se hace aquí (no en
  // el effect) para no disparar setState síncrono dentro del effect.
  function changeRange(key: string) {
    setRange(key);
    setLoading(true);
    setError("");
    setShowAllQueries(false);
    setShowAllPages(false);
  }

  async function handleImport() {
    if (!data || data.topQueries.length === 0) return;
    setImporting(true);
    setImportResult(null);
    const keywords = data.topQueries.slice(0, IMPORT_LIMIT).map((q) => q.query).join("\n");
    const name = `Queries reales GSC — ${new Date().toLocaleDateString("es-ES")}`;
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, keywords }),
    });
    const d = await res.json().catch(() => ({}));
    setImporting(false);
    if (!res.ok) {
      setImportResult({ ok: false, message: d.error ?? "No se pudo crear el estudio" });
      return;
    }
    setImportResult({ ok: true, message: `Estudio creado con ${Math.min(IMPORT_LIMIT, data.topQueries.length)} queries reales.` });
  }

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-gray-400" />;
  if (error) return <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>;
  if (!data) return null;

  const t = data.totals;
  const toggleQSort = (key: SortKey) =>
    setQSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "position" ? "asc" : "desc" }));
  const togglePSort = (key: SortKey) =>
    setPSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "position" ? "asc" : "desc" }));
  const sortedQueries = sortRows(data.topQueries, qSort);
  const sortedPages = sortRows(data.topPages, pSort);
  const queriesShown = showAllQueries ? sortedQueries.length : Math.min(QUERIES_INITIAL, sortedQueries.length);
  const pagesShown = showAllPages ? sortedPages.length : Math.min(PAGES_INITIAL, sortedPages.length);
  const rangeLabel = RANGE_OPTIONS.find((r) => r.key === data.rangeKey)?.label ?? data.rangeKey;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Rendimiento en Search Console</h3>
          <p className="text-xs text-gray-500">Datos reales de Google · periodo: {rangeLabel}</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => changeRange(r.key)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                range === r.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Clics" value={fmtInt(t.clicks)} />
        <Kpi label="Impresiones" value={fmtInt(t.impressions)} />
        <Kpi label="CTR medio" value={fmtPct(t.ctr)} />
        <Kpi label="Posición media" value={fmtPos(t.position)} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Evolución (12 meses)</h4>
        <MonthlyChart points={data.timeseries} />
      </div>

      {/* Desgloses secundarios: dispositivo (compacto) + país (tabla) */}
      {(data.byDevice.length > 0 || data.byCountry.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {data.byDevice.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Por dispositivo</h4>
              <div className="space-y-1.5">
                {data.byDevice.map((d) => (
                  <div key={d.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-700">{DEVICE_LABEL[d.key] ?? d.key}</span>
                    <span className="text-gray-500 tabular-nums">
                      {fmtInt(d.clicks)} clics · {fmtPct(d.ctr)} CTR · pos. {fmtPos(d.position)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.byCountry.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Por país (top 10)</h4>
              <div className="space-y-1.5">
                {data.byCountry.slice(0, 10).map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-700">{c.key}</span>
                    <span className="text-gray-500 tabular-nums">
                      {fmtInt(c.clicks)} clics · {fmtInt(c.impressions)} imp.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top queries */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Queries que traen tráfico ({data.topQueries.length})
            </h4>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || data.topQueries.length === 0}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              title="Crea un estudio del Módulo 1 con las top queries reales"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Crear estudio de keywords
            </button>
          </div>
          {importResult && (
            <p className={cn("text-xs px-2.5 py-1.5 rounded-lg", importResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
              {importResult.ok && <Check className="inline h-3.5 w-3.5 mr-1" />}
              {importResult.message}
              {importResult.ok && (
                <Link href={`/admin/proyectos/${projectId}/keywords`} className="underline ml-1">Ver estudio →</Link>
              )}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-1.5 pr-3 font-medium">Query</th>
                  <SortTh col="clicks" sort={qSort} onSort={toggleQSort} />
                  <SortTh col="impressions" sort={qSort} onSort={toggleQSort} />
                  <SortTh col="ctr" sort={qSort} onSort={toggleQSort} />
                  <SortTh col="position" sort={qSort} onSort={toggleQSort} />
                </tr>
              </thead>
              <tbody>
                {sortedQueries.slice(0, queriesShown).map((q) => (
                  <tr key={q.query} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 pr-3 text-gray-900 truncate max-w-[160px]">{q.query}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-700">{fmtInt(q.clicks)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">{fmtInt(q.impressions)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">{fmtPct(q.ctr)}</td>
                    <td className="py-1.5 text-right">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <span className="tabular-nums text-gray-700">{fmtPos(q.position)}</span>
                        <PositionTrend current={q.position} prev={q.prevPosition} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.topQueries.length > QUERIES_INITIAL && (
            <button
              type="button"
              onClick={() => setShowAllQueries((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAllQueries ? "rotate-180" : "")} />
              {showAllQueries ? "Ver menos" : `Ver las ${data.topQueries.length} queries`}
            </button>
          )}
        </div>

        {/* Top pages */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Páginas que más trafican ({data.topPages.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-1.5 pr-3 font-medium">Página</th>
                  <SortTh col="clicks" sort={pSort} onSort={togglePSort} />
                  <SortTh col="impressions" sort={pSort} onSort={togglePSort} />
                  <SortTh col="ctr" sort={pSort} onSort={togglePSort} />
                  <SortTh col="position" sort={pSort} onSort={togglePSort} />
                </tr>
              </thead>
              <tbody>
                {sortedPages.slice(0, pagesShown).map((p) => (
                  <tr key={p.page} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 pr-3 text-gray-900 truncate max-w-[180px]" title={p.page}>
                      <Link href={p.page} target="_blank" rel="noreferrer" className="hover:underline">
                        {shortUrl(p.page)}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-700">{fmtInt(p.clicks)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">{fmtInt(p.impressions)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">{fmtPct(p.ctr)}</td>
                    <td className="py-1.5 text-right">
                      <span className="inline-flex items-center gap-1 justify-end">
                        <span className="tabular-nums text-gray-700">{fmtPos(p.position)}</span>
                        <PositionTrend current={p.position} prev={p.prevPosition} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.topPages.length > PAGES_INITIAL && (
            <button
              type="button"
              onClick={() => setShowAllPages((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAllPages ? "rotate-180" : "")} />
              {showAllPages ? "Ver menos" : `Ver las ${data.topPages.length} páginas`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
