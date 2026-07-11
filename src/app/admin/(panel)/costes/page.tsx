"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type EndpointRow = { api: string; endpoint: string; cost: number; count: number };
type ProjectRow = { projectId: string | null; name: string; cost: number; limit: number | null };

type CostData = {
  monthLabel: string;
  dataforseo: { spentUsd: number; limitUsd: number | null; nearLimit: boolean; blocked: boolean };
  totalUsd: number;
  byEndpoint: EndpointRow[];
  byProject: ProjectRow[];
};

const ENDPOINT_LABELS: Record<string, string> = {
  "modulo1.keywords.volumen": "M1 · Volumen de keywords",
  "modulo1.keywords.intencion": "M1 · Intención de keywords",
  "modulo1.estructura": "M1 · Estructura de URLs (IA)",
  "modulo3.titulos-meta": "M3 · Títulos y meta (IA)",
  "modulo4.schema.article": "M4 · Schema Article (IA)",
  "modulo4.schema.faq": "M4 · Schema FAQ (IA)",
  "modulo7.contenido": "M7 · Contenido (IA)",
  "modulo5.rankcheck": "M5 · Rank tracking",
  "modulo9.geogrid": "M9 · Geogrid",
};

function Bar({ pct, className }: { pct: number; className: string }) {
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
      <div className={cn("h-full rounded-full", className)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function CostesPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/costes")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.totalUsd === "number") setData(d);
        setLoading(false);
      });
  }, []);

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-gray-400" />;
  if (!data) return <p className="text-sm text-gray-500">No se pudieron cargar los costes.</p>;

  const dfs = data.dataforseo;
  const dfsPct = dfs.limitUsd !== null ? (dfs.spentUsd / dfs.limitUsd) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Costes de API</h1>
        <p className="text-sm text-gray-500 mt-1 capitalize">{data.monthLabel}</p>
      </div>

      {/* DataForSEO vs tope */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">DataForSEO</h2>
          {dfs.limitUsd !== null && dfs.blocked && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Tope alcanzado
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-gray-900">{dfs.spentUsd.toFixed(2)}$</span>
          {dfs.limitUsd !== null ? (
            <span className="text-sm text-gray-400">/ {dfs.limitUsd.toFixed(2)}$ configurados</span>
          ) : (
            <span className="text-xs text-gray-400">(sin tope — define DATAFORSEO_MONTHLY_LIMIT_USD)</span>
          )}
        </div>
        {dfs.limitUsd !== null && (
          <Bar
            pct={dfsPct}
            className={dfs.blocked ? "bg-red-500" : dfs.nearLimit ? "bg-amber-400" : "bg-emerald-500"}
          />
        )}
      </div>

      {/* Total mes (todas las APIs) */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900">Total del mes (todas las APIs)</h2>
        <div className="text-2xl font-semibold text-gray-900 mt-1">{data.totalUsd.toFixed(2)}$</div>
        <p className="text-xs text-gray-400">Incluye DataForSEO y OpenRouter (títulos, schema, contenido...).</p>
      </div>

      {/* Desglose por endpoint */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Por tipo de llamada</h2>
        {data.byEndpoint.length === 0 ? (
          <p className="text-sm text-gray-500">Sin consumo este mes.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.byEndpoint.map((r) => (
                <tr key={r.api + r.endpoint} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-gray-700">
                    {ENDPOINT_LABELS[r.endpoint] ?? r.endpoint}
                    <span className="text-xs text-gray-400 ml-1">· {r.count} {r.count === 1 ? "llamada" : "llamadas"}</span>
                  </td>
                  <td className="py-2 text-right text-gray-900 tabular-nums">{r.cost.toFixed(3)}$</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Desglose por proyecto */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Por proyecto</h2>
        {data.byProject.length === 0 ? (
          <p className="text-sm text-gray-500">Sin consumo este mes.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.byProject.map((r) => (
                <tr key={(r.projectId ?? "null") + r.name} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-gray-700 truncate">{r.name}</td>
                  <td className="py-2 text-right text-gray-900 tabular-nums">
                    {r.cost.toFixed(3)}$
                    {r.limit !== null && (
                      <span className={cn("text-xs ml-1", r.cost >= r.limit ? "text-red-600" : r.cost >= r.limit * 0.8 ? "text-amber-600" : "text-gray-400")}>
                        / {r.limit.toFixed(2)}$
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
