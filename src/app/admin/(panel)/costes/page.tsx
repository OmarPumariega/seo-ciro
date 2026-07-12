"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import ProjectSwitcher, { type ProjectInfo } from "@/components/admin/ProjectSwitcher";

type EndpointRow = { api: string; endpoint: string; cost: number; count: number };
type ProjectRow = { projectId: string | null; name: string; cost: number; limit: number | null };
type CallRow = { id: string; api: string; endpoint: string; model: string | null; cost: number; createdAt: string };

type CostData = {
  monthLabel: string;
  scope: "global" | "project";
  project: { id: string; name: string } | null;
  dataforseo: { spentUsd: number; limitUsd: number | null; nearLimit: boolean; blocked: boolean };
  totalUsd: number;
  byEndpoint: EndpointRow[];
  byProject: ProjectRow[];
  recentCalls: CallRow[];
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
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/proyectos")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ProjectInfo[]) => {
        if (Array.isArray(list)) setProjects(list.map((p) => ({ id: p.id, name: p.name, isLocalBusiness: !!p.isLocalBusiness })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = selectedProjectId ? `/api/costes?projectId=${selectedProjectId}` : "/api/costes";
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.totalUsd === "number") setData(d);
        setLoading(false);
      });
  }, [selectedProjectId]);

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-gray-400" />;
  if (!data) return <p className="text-sm text-gray-500">No se pudieron cargar los costes.</p>;

  const dfs = data.dataforseo;
  const dfsPct = dfs.limitUsd !== null ? (dfs.spentUsd / dfs.limitUsd) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Costes de API</h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">
            {data.monthLabel}
            {data.project && <> · {data.project.name}</>}
          </p>
        </div>
        <button
          onClick={() =>
            downloadCsv(`costes-${data.monthLabel.replace(/\s+/g, "-")}${data.project ? `-${data.project.name}` : ""}.csv`, ["Sección", "Concepto", "Coste (USD)", "Llamadas / tope"], [
              ...data.byProject.map((r) => ["Por proyecto", r.name, r.cost.toFixed(3), r.limit !== null ? `tope ${r.limit.toFixed(2)}$` : ""]),
              ...data.byEndpoint.map((r) => ["Por tipo de llamada", ENDPOINT_LABELS[r.endpoint] ?? r.endpoint, r.cost.toFixed(3), `${r.count} llamadas`]),
              ...data.recentCalls.map((c) => [
                "Llamada individual",
                `${ENDPOINT_LABELS[c.endpoint] ?? c.endpoint}${c.model ? ` (${c.model})` : ""}`,
                c.cost.toFixed(4),
                new Date(c.createdAt).toLocaleString("es-ES"),
              ]),
            ])
          }
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 shrink-0"
          title="Exportar a CSV"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      {/* Filtro por proyecto: mismo desglose pero acotado a uno solo, con
          trazabilidad total hasta la llamada individual. */}
      <div className="flex items-center gap-2">
        <div className="w-72">
          <ProjectSwitcher projects={projects} currentId={selectedProjectId} onSelect={setSelectedProjectId} />
        </div>
        {selectedProjectId && (
          <button
            onClick={() => setSelectedProjectId(null)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 px-2 py-1"
          >
            <X className="h-3.5 w-3.5" />
            Ver todos los proyectos
          </button>
        )}
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
        <h2 className="text-sm font-semibold text-gray-900">
          Total del mes (todas las APIs){data.project && <> · {data.project.name}</>}
        </h2>
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

      {/* Desglose por proyecto — solo en la vista global; en la vista de un
          proyecto ya está todo acotado, esta tabla no aportaría nada. Cada
          fila lleva directo a su vista filtrada (mismo atajo que el selector). */}
      {data.scope === "global" && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Por proyecto</h2>
          {data.byProject.length === 0 ? (
            <p className="text-sm text-gray-500">Sin consumo este mes.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.byProject.map((r) => (
                  <tr
                    key={(r.projectId ?? "null") + r.name}
                    className={cn(
                      "border-b border-gray-50 last:border-0",
                      r.projectId && "cursor-pointer hover:bg-gray-50"
                    )}
                    onClick={() => r.projectId && setSelectedProjectId(r.projectId)}
                  >
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
      )}

      {/* Llamadas individuales — solo en la vista de un proyecto: control
          total hasta la llamada concreta (qué API, qué módulo, cuándo, coste). */}
      {data.scope === "project" && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Llamadas recientes ({data.recentCalls.length}{data.recentCalls.length === 100 ? "+" : ""})
          </h2>
          {data.recentCalls.length === 0 ? (
            <p className="text-sm text-gray-500">Sin llamadas registradas este mes.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="font-medium py-1.5 pr-2">Módulo / llamada</th>
                    <th className="font-medium py-1.5 px-2">Modelo</th>
                    <th className="font-medium py-1.5 px-2 text-right">Coste</th>
                    <th className="font-medium py-1.5 pl-2 text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentCalls.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 pr-2 text-gray-700">{ENDPOINT_LABELS[c.endpoint] ?? c.endpoint}</td>
                      <td className="py-1.5 px-2 text-gray-400 text-xs">{c.model ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right text-gray-900 tabular-nums">{c.cost.toFixed(4)}$</td>
                      <td className="py-1.5 pl-2 text-right text-gray-400 text-xs whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleString("es-ES")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
