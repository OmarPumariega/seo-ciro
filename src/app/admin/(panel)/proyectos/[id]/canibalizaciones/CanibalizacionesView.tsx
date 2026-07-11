"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, GitBranch, AlertTriangle, Crown } from "lucide-react";

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
    return (
      <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{data.error}</p>
    );
  }

  const items = data?.items ?? [];

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
        <div className="space-y-4">
          {items.map((item) => {
            const [winner, ...rest] = item.pages;
            return (
              <div
                key={item.query}
                className="bg-white rounded-xl border border-gray-100 p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    “{item.query}”
                  </h3>
                  <span className="text-xs text-gray-500">
                    {item.pages.length} URLs ·{" "}
                    {item.pages.reduce((s, p) => s + p.clicks, 0)} clics
                  </span>
                </div>

                <ul className="space-y-2">
                  <li className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <Crown className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-sm text-gray-900 truncate flex-1 min-w-0">
                      {winner.url}
                    </span>
                    <span className="text-xs font-medium text-emerald-700">
                      {winner.clicks} clics · pos. {winner.position.toFixed(1)}
                    </span>
                  </li>
                  {rest.map((page) => (
                    <li
                      key={page.url}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-3 py-2"
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="text-sm text-gray-700 truncate flex-1 min-w-0">
                        {page.url}
                      </span>
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
    </div>
  );
}
