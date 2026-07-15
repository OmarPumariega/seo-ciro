"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Network, Link2, AlertTriangle, Download } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import UrlLink from "@/components/admin/UrlLink";

type PageRow = {
  url: string;
  pagerank: number;
  incoming: number;
  outgoing: number;
  externalLinks: number;
  externalDomains: string[];
};

type EnlacesData = {
  pages: PageRow[];
  orphans: string[];
  topHubs: string[];
  topExternalDomains: { domain: string; pages: number }[];
  totalExternalLinks: number;
  auditDate: string;
};

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

  const all = data.pages;
  const maxRank = all.length > 0 ? all[0].pagerank : 0;
  const hubs = data.topHubs
    .map((url) => data.pages.find((p) => p.url === url))
    .filter((p): p is PageRow => Boolean(p));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Enlazado interno</h2>
        <p className="text-sm text-gray-500 mt-1">
          PageRank interno calculado sobre el grafo de enlaces de la última auditoría — identifica qué URLs reciben más fuerza, cuáles están huérfanas y cuáles son hubs distribuidores.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {all.length} URLs analizadas · {data.totalExternalLinks} enlaces externos · auditoría del {new Date(data.auditDate).toLocaleDateString("es-ES")}
        </p>
      </div>

      {/* Tabla completa de PageRank por URL */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              PageRank por URL ({all.length})
            </h3>
          </div>
              <button
            onClick={() =>
              downloadCsv(
                `pagerank-${projectId}-${new Date().toISOString().slice(0, 10)}.csv`,
                ["URL", "PageRank (%)", "Entrantes", "Salientes", "Externos"],
                all.map((p) => [p.url, (p.pagerank * 100).toFixed(2), p.incoming, p.outgoing, p.externalLinks])
              )
            }
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
            title="Exportar a CSV"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="font-medium py-2 pr-4">URL</th>
                <th className="font-medium py-2 px-2 text-right">PageRank</th>
                <th className="font-medium py-2 px-2 text-right">Entrantes</th>
                <th className="font-medium py-2 px-2 text-right">Salientes</th>
                <th className="font-medium py-2 px-2 text-right">Externos</th>
                <th className="font-medium py-2 pl-2 w-32">Fuerza</th>
              </tr>
            </thead>
            <tbody>
              {all.map((page) => {
                const widthPct = maxRank > 0 ? (page.pagerank / maxRank) * 100 : 0;
                return (
                  <tr key={page.url} className="border-b border-gray-50">
                    <td className="py-1.5 pr-4 max-w-[320px]">
                      <UrlLink url={page.url} className="text-xs" />
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-500 tabular-nums text-xs">
                      {(page.pagerank * 100).toFixed(2)}%
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-500 tabular-nums">
                      {page.incoming}
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-500 tabular-nums">
                      {page.outgoing}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums" title={page.externalDomains.join(", ")}>
                      {page.externalLinks > 0 ? (
                        <span className="text-gray-600">{page.externalLinks}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="py-1.5 pl-2">
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-900 rounded-full"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                  <span className="inline-block bg-amber-50 px-2 py-1 rounded-md max-w-full align-middle">
                    <UrlLink url={url} className="text-xs text-amber-700 hover:text-amber-900" showIcon={false} />
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
                <span className="flex items-center min-w-0">
                  <span className="text-gray-400 mr-2 tabular-nums shrink-0">{i + 1}.</span>
                  <UrlLink url={hub.url} className="text-sm" />
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

      {/* Dominios externos más enlazados */}
      {data.topExternalDomains.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Dominios externos más enlazados ({data.topExternalDomains.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.topExternalDomains.map((d) => (
              <span
                key={d.domain}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700"
                title={`${d.pages} página(s) enlazan este dominio`}
              >
                {d.domain}
                <span className="text-gray-400 tabular-nums">· {d.pages}</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Dominios a los que tu sitio enlaza (según el rastreo). El número indica en cuántas páginas aparecen.
          </p>
        </div>
      )}
    </div>
  );
}
