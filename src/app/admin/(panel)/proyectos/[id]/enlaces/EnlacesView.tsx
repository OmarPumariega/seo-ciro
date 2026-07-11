"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Network, Link2, AlertTriangle } from "lucide-react";

type PageRow = {
  url: string;
  pagerank: number;
  incoming: number;
  outgoing: number;
};

type EnlacesData = {
  pages: PageRow[];
  orphans: string[];
  topHubs: string[];
  auditDate: string;
};

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

export default function EnlacesView({ projectId }: { projectId: string }) {
  const [data, setData] = useState<EnlacesData | null>(null);
  const [needsAudit, setNeedsAudit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/enlaces`)
      .then((r) => r.json())
      .then((body) => {
        if (body && body.needsAudit) setNeedsAudit(true);
        else if (body && Array.isArray(body.pages)) setData(body);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Analizando el enlazado interno…
      </div>
    );
  }

  if (needsAudit) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-2">
        <div className="flex items-center gap-2 text-gray-900 font-medium">
          <Network className="h-5 w-5 text-gray-400" />
          Aún no hay grafo de enlaces
        </div>
        <p className="text-sm text-gray-500">
          Ejecuta una auditoría (Módulo 8) para analizar el enlazado interno. El
          rastreo construye el grafo de enlaces sobre el que se calcula el
          PageRank y se detectan las páginas huérfanas.
        </p>
        <Link
          href={`/admin/proyectos/${projectId}/auditoria`}
          className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
        >
          Ir a Auditoría
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const top = data.pages.slice(0, 15);
  const maxRank = top.length > 0 ? top[0].pagerank : 0;
  const hubs = data.topHubs
    .map((url) => data.pages.find((p) => p.url === url))
    .filter((p): p is PageRow => Boolean(p));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Enlazado interno</h2>
        <p className="text-sm text-gray-500 mt-1">
          Fuerza de PageRank por URL y detección de páginas huérfanas a partir
          del último rastreo de auditoría · {new Date(data.auditDate).toLocaleDateString("es-ES")}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Network className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            PageRank por URL (top {top.length})
          </h3>
        </div>
        <div className="space-y-2.5">
          {top.map((page) => {
            const widthPct = maxRank > 0 ? (page.pagerank / maxRank) * 100 : 0;
            return (
              <div key={page.url} className="grid grid-cols-[1fr_auto] gap-3 items-center">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-gray-700 truncate" title={page.url}>
                      {pathOf(page.url)}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                      {(page.pagerank * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-900 rounded-full"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Páginas huérfanas ({data.orphans.length})
            </h3>
          </div>
          {data.orphans.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay páginas huérfanas: todas reciben al menos un enlace interno.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.orphans.map((url) => (
                <li key={url}>
                  <span
                    className="inline-block text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-md truncate max-w-full align-middle"
                    title={url}
                  >
                    {pathOf(url)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Candidatas a enlazar desde otras páginas para que reciban fuerza.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Principales distribuidoras (hubs)
            </h3>
          </div>
          <ol className="space-y-1.5">
            {hubs.map((hub, i) => (
              <li key={hub.url} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-700 truncate" title={hub.url}>
                  <span className="text-gray-400 mr-2 tabular-nums">{i + 1}.</span>
                  {pathOf(hub.url)}
                </span>
                <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                  {hub.outgoing} salientes
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-gray-400 mt-3">
            Páginas que más enlaces reparten — buenas distribuidoras de fuerza.
          </p>
        </div>
      </div>
    </div>
  );
}
