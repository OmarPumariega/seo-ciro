"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, GitBranch, AlertTriangle, Crown, ArrowDownUp } from "lucide-react";
import { cn } from "@/lib/utils";
import UrlLink from "@/components/admin/UrlLink";

type CannibalizedPage = {
  url: string;
  clicks: number;
  impressions: number;
  position: number;
};
type Cannibalization = { query: string; pages: CannibalizedPage[] };
type Payload = { needsGsc?: true; items?: Cannibalization[]; error?: string };

export default function CanibalizacionesView({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  // Filtro/orden de urgencia: impacto (clics), severidad (nº URLs), urgencia
  // (posición del ganador). Todo client-side: los datos ya vienen del backend.
  const [minClicks, setMinClicks] = useState(0);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [sortBy, setSortBy] = useState<"clicks" | "urls" | "position">("clicks");

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/canibalizaciones`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? "Error al cargar las canibalizaciones");
        }
        return r.json();
      })
      .then((payload: Payload) => setData(payload))
      .catch((err) => setData({ error: err.message }))
      .finally(() => setLoading(false));
  }, [projectId]);

  const items = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => {
    const enriched = items.map((item) => {
      const clicks = item.pages.reduce((s, p) => s + p.clicks, 0);
      const winnerPos = item.pages[0]?.position ?? 99;
      return { item, clicks, urls: item.pages.length, winnerPos };
    });
    return enriched
      .filter((e) => e.clicks >= minClicks)
      .filter((e) => (onlyUrgent ? e.winnerPos <= 10 : true))
      .sort((a, b) => {
        if (sortBy === "urls") return b.urls - a.urls || b.clicks - a.clicks;
        if (sortBy === "position") return a.winnerPos - b.winnerPos || b.clicks - a.clicks;
        return b.clicks - a.clicks;
      });
  }, [items, minClicks, onlyUrgent, sortBy]);

  const sortOptions: { key: typeof sortBy; label: string }[] = [
    { key: "clicks", label: "Más clics (impacto)" },
    { key: "urls", label: "Más URLs (severidad)" },
    { key: "position", label: "Mejor posición (urgencia)" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (data?.needsGsc) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-sm text-gray-600">
          Conecta Search Console (pestaña{" "}
          <Link
            href={`/admin/proyectos/${projectId}/google`}
            className="text-gray-900 font-medium underline"
          >
            Google
          </Link>
          ) y selecciona la propiedad para detectar canibalizaciones.
        </p>
      </div>
    );
  }

  if (data?.error) {
    return <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{data.error}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-gray-400" />
          Canibalizaciones
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Keywords para las que el sitio posiciona 2 o más URLs distintas (últimos 90 días,
          datos de Search Console).
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm text-gray-600">
            No se detectan canibalizaciones en los últimos 90 días.
          </p>
        </div>
      ) : (
        <>
          {/* Filtros de urgencia / importancia */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-gray-500">
              <ArrowDownUp className="h-4 w-4" />
              <span className="text-xs">Ordenar por</span>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white"
            >
              {sortOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyUrgent}
                onChange={(e) => setOnlyUrgent(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-xs">Solo urgentes (ganador en top 10)</span>
            </label>
            <label className="flex items-center gap-1.5 text-gray-600 ml-auto">
              <span className="text-xs">Mín. clics</span>
              <input
                type="number"
                min={0}
                value={minClicks}
                onChange={(e) => setMinClicks(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              />
            </label>
            <span className="text-xs text-gray-400">{filtered.length} de {items.length}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-sm text-gray-600">Ninguna canibalización cumple el filtro actual.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map(({ item, clicks, winnerPos }) => {
                const [winner, ...rest] = item.pages;
                return (
                  <div key={item.query} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">“{item.query}”</h3>
                      <div className="flex items-center gap-2">
                        {clicks >= 50 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">alto impacto</span>
                        )}
                        {winnerPos <= 10 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">urgente</span>
                        )}
                        <span className="text-xs text-gray-500">
                          {item.pages.length} URLs · {clicks} clics
                        </span>
                      </div>
                    </div>

                    <ul className="space-y-2">
                      <li className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 border-emerald-200 bg-emerald-50")}>
                        <Crown className="h-4 w-4 text-emerald-600 shrink-0" />
                        <UrlLink url={winner.url} className="text-sm flex-1" />
                        <span className="text-xs font-medium text-emerald-700">
                          {winner.clicks} clics · pos. {winner.position.toFixed(1)}
                        </span>
                      </li>
                      {rest.map((page) => (
                        <li key={page.url} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                          <UrlLink url={page.url} className="text-sm flex-1" />
                          <span className="text-xs text-gray-500">
                            {page.clicks} clics · pos. {page.position.toFixed(1)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
