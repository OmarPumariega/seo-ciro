"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, AlertTriangle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import UrlLink from "@/components/admin/UrlLink";

type AuditPage = {
  id: string;
  url: string;
  externalLinksCount: number;
  externalDomains: string[] | null;
};

type AuditRun = {
  id: string;
  status: string;
  robotsContent: string | null;
  robotsBlocked: boolean;
  sitemapFound: boolean | null;
  sitemapUrlCount: number | null;
  sitemapUrls: string[] | null;
  pages?: AuditPage[];
};

export default function AuditTechnicalDetails({
  projectId,
  auditRunId,
}: {
  projectId: string;
  auditRunId: string;
}) {
  const [run, setRun] = useState<AuditRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSitemapUrls, setShowSitemapUrls] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/proyectos/${projectId}/auditorias/${auditRunId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudo cargar la auditoría");
        return res.json() as Promise<AuditRun>;
      })
      .then((data) => {
        if (!cancelled) setRun(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, auditRunId]);

  // Agrega los externalDomains de todas las páginas: dominio → nº de páginas que lo enlazan.
  const { totalExternalLinks, uniqueDomainCount, topDomains } = useMemo(() => {
    const pages = run?.pages ?? [];
    const totalExternalLinks = pages.reduce((sum, p) => sum + (p.externalLinksCount ?? 0), 0);
    const domainPageCount = new Map<string, number>();
    for (const page of pages) {
      const domains = page.externalDomains ?? [];
      // externalDomains ya viene deduplicado por página, así que contar cada dominio una vez por página.
      for (const domain of domains) {
        domainPageCount.set(domain, (domainPageCount.get(domain) ?? 0) + 1);
      }
    }
    const sorted = [...domainPageCount.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    return {
      totalExternalLinks,
      uniqueDomainCount: sorted.length,
      topDomains: sorted.slice(0, 15),
    };
  }, [run]);

  const sitemapUrlSample = (run?.sitemapUrls ?? []).slice(0, 10);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Detalle técnico</h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando detalle técnico...
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : run ? (
        <div className="space-y-4">
          {/* robots.txt */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              robots.txt
            </h4>
            {run.robotsBlocked && (
              <div className="flex items-center gap-2 text-sm bg-amber-50 text-amber-700 px-3 py-2 rounded-lg">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                El robots.txt bloquea el rastreo.
              </div>
            )}
            {run.robotsContent ? (
              <pre className="text-xs font-mono bg-gray-50 p-3 rounded-lg max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                {run.robotsContent}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">No se encontró robots.txt.</p>
            )}
          </section>

          {/* sitemap.xml */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              sitemap.xml
            </h4>
            {run.sitemapFound ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-700">
                  Sitemap encontrado
                  {run.sitemapUrlCount !== null && run.sitemapUrlCount !== undefined && (
                    <span className="text-gray-500">
                      {" "}
                      · {run.sitemapUrlCount.toLocaleString("es-ES")} URLs
                    </span>
                  )}
                </p>
                {sitemapUrlSample.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowSitemapUrls((v) => !v)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
                    >
                      {showSitemapUrls ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      Ver URLs
                    </button>
                    {showSitemapUrls && (
                      <ul className="mt-2 space-y-1 text-xs font-mono">
                        {sitemapUrlSample.map((u) => (
                          <li key={u}>
                            <UrlLink url={u} className="text-xs" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ) : run.sitemapFound === false ? (
              <p className="text-sm text-red-600">No se encontró sitemap.xml.</p>
            ) : (
              <p className="text-sm text-gray-500">No se comprobó el sitemap.</p>
            )}
          </section>

          {/* Enlaces externos */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Enlaces externos
            </h4>
            <p className="text-sm text-gray-700">
              {totalExternalLinks.toLocaleString("es-ES")} enlace
              {totalExternalLinks === 1 ? "" : "s"} externo
              {totalExternalLinks === 1 ? "" : "s"}
              {uniqueDomainCount > 0 && (
                <span className="text-gray-500">
                  {" "}
                  · {uniqueDomainCount} dominio{uniqueDomainCount === 1 ? "" : "s"}
                  {uniqueDomainCount > 15 ? " (top 15)" : ""}
                </span>
              )}
            </p>
            {topDomains.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="py-1.5 pr-3 font-medium">Dominio</th>
                    <th className="py-1.5 pl-3 font-medium text-right">Páginas que enlazan</th>
                  </tr>
                </thead>
                <tbody>
                  {topDomains.map(([domain, count]) => (
                    <tr key={domain} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-xs break-all">
                        <a
                          href={`https://${domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          {domain}
                        </a>
                      </td>
                      <td className="py-1.5 pl-3 text-gray-700 text-right tabular-nums">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500">Sin enlaces externos detectados.</p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
