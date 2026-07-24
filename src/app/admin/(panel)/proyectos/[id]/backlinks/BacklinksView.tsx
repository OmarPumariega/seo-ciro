"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, ChevronDown, ChevronUp, ExternalLink, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { backlinkAnalysisCostUsd } from "@/lib/dataforseo/pricing";

type TopBacklink = {
  urlFrom: string | null;
  domainFrom: string | null;
  domainFromRank: number | null;
  anchor: string | null;
  dofollow: boolean | null;
  firstSeen: string | null;
};

type Snapshot = {
  id: string;
  domain: string;
  rank: number | null;
  backlinksTotal: number | null;
  referringDomains: number | null;
  referringMainDomains: number | null;
  dofollowBacklinks: number | null;
  nofollowBacklinks: number | null;
  brokenBacklinks: number | null;
  topBacklinks: TopBacklink[] | null;
  fetchedAt: string;
} | null;

type CompetitorRow = { domain: string; snapshot: Snapshot };

type Data = {
  projectDomain: string | null;
  projectSnapshot: Snapshot;
  competitors: CompetitorRow[];
};

const analyzeCost = backlinkAnalysisCostUsd();

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toLocaleString("es-ES");
}

function rankBadge(rank: number | null): string {
  if (rank === null) return "bg-gray-100 text-gray-400";
  if (rank >= 500) return "bg-emerald-50 text-emerald-700";
  if (rank >= 200) return "bg-amber-50 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

function DomainDetail({
  label,
  domain,
  snapshot,
  analyzing,
  onAnalyze,
}: {
  label: string;
  domain: string | null;
  snapshot: Snapshot;
  analyzing: boolean;
  onAnalyze: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!domain) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-sm text-gray-500">
          Define el dominio del proyecto en su ficha para analizar sus backlinks.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="text-sm font-semibold text-gray-900">{domain}</p>
        </div>
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          title={`Coste estimado ~$${analyzeCost.toFixed(2)}`}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Analizar <span className="opacity-70">~${analyzeCost.toFixed(2)}</span>
        </button>
      </div>

      {!snapshot ? (
        <p className="text-xs text-gray-400">Sin analizar todavía.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[11px] text-gray-400">Autoridad</p>
              <span className={cn("inline-block mt-0.5 px-1.5 py-0.5 rounded text-sm font-semibold", rankBadge(snapshot.rank))}>
                {snapshot.rank ?? "—"}
              </span>
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Backlinks</p>
              <p className="text-sm font-medium text-gray-900">{fmtNum(snapshot.backlinksTotal)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Dominios de referencia</p>
              <p className="text-sm font-medium text-gray-900">{fmtNum(snapshot.referringDomains)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Rotos</p>
              <p className="text-sm font-medium text-gray-900">{fmtNum(snapshot.brokenBacklinks)}</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            {snapshot.dofollowBacklinks != null && snapshot.nofollowBacklinks != null && (
              <>dofollow {fmtNum(snapshot.dofollowBacklinks)} · nofollow {fmtNum(snapshot.nofollowBacklinks)} · </>
            )}
            actualizado {new Date(snapshot.fetchedAt).toLocaleDateString("es-ES")}
          </p>

          {snapshot.topBacklinks && snapshot.topBacklinks.length > 0 && (
            <div>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Top backlinks ({snapshot.topBacklinks.length})
              </button>
              {expanded && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-100">
                        <th className="py-1.5 pr-2 font-medium">Origen</th>
                        <th className="py-1.5 pr-2 font-medium text-right">Autoridad</th>
                        <th className="py-1.5 pr-2 font-medium">Anchor</th>
                        <th className="py-1.5 pr-2 font-medium">Tipo</th>
                        <th className="py-1.5 pr-2 font-medium">Visto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.topBacklinks.map((b, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="py-1.5 pr-2 text-gray-900">
                            {b.urlFrom ? (
                              <a
                                href={b.urlFrom}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
                              >
                                <span className="truncate max-w-[220px] inline-block align-bottom">{b.domainFrom ?? b.urlFrom}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            ) : (
                              b.domainFrom ?? "—"
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">{b.domainFromRank ?? "—"}</td>
                          <td className="py-1.5 pr-2 text-gray-600 truncate max-w-[160px]">{b.anchor || "—"}</td>
                          <td className="py-1.5 pr-2 text-gray-500">{b.dofollow === false ? "nofollow" : "dofollow"}</td>
                          <td className="py-1.5 pr-2 text-gray-400">
                            {b.firstSeen ? new Date(b.firstSeen).toLocaleDateString("es-ES") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BacklinksView({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingDomain, setAnalyzingDomain] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load() {
    fetch(`/api/proyectos/${projectId}/backlinks`)
      .then((r) => r.json())
      .then((d: Data) => setData(d))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAnalyze(domain: string) {
    setError("");
    setAnalyzingDomain(domain);
    const res = await fetch(`/api/proyectos/${projectId}/backlinks/analizar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });
    const d = await res.json();
    setAnalyzingDomain(null);
    if (!res.ok) {
      setError(d.error ?? "Error al analizar");
      return;
    }
    load();
  }

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-gray-400" />;

  const comparisonRows = [
    ...(data?.projectDomain
      ? [{ domain: data.projectDomain, snapshot: data.projectSnapshot, isOwn: true }]
      : []),
    ...(data?.competitors.map((c) => ({ domain: c.domain, snapshot: c.snapshot, isOwn: false })) ?? []),
  ].sort((a, b) => (b.snapshot?.rank ?? -1) - (a.snapshot?.rank ?? -1));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Backlinks</h2>
        <p className="text-sm text-gray-500 mt-1">
          Enlazado externo: qué dominios enlazan a tu sitio (y a los de tus competidores ya trackeados
          en Competidores), cuánta autoridad tienen y desde dónde. A diferencia del resto de la
          herramienta, esto usa un producto de DataForSEO nuevo — cada análisis tiene coste real.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {comparisonRows.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Comparativa de autoridad</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-1.5 pr-2 font-medium">Dominio</th>
                  <th className="py-1.5 px-2 font-medium text-right">Autoridad</th>
                  <th className="py-1.5 px-2 font-medium text-right">Backlinks</th>
                  <th className="py-1.5 pl-2 font-medium text-right">Dominios de ref.</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="py-1.5 pr-2 text-gray-900 font-medium">
                      {r.domain} {r.isOwn && <span className="text-[10px] text-emerald-700 font-semibold">· TÚ</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <span className={cn("inline-block px-1.5 py-0.5 rounded font-medium", rankBadge(r.snapshot?.rank ?? null))}>
                        {r.snapshot?.rank ?? "—"}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-gray-600">{fmtNum(r.snapshot?.backlinksTotal)}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums text-gray-600">{fmtNum(r.snapshot?.referringDomains)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DomainDetail
        label="Tu dominio"
        domain={data?.projectDomain ?? null}
        snapshot={data?.projectSnapshot ?? null}
        analyzing={analyzingDomain === data?.projectDomain}
        onAnalyze={() => data?.projectDomain && handleAnalyze(data.projectDomain)}
      />

      {data?.competitors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-500">
            Todavía no hay competidores trackeados. Añádelos en el módulo Competidores — aquí se
            reutiliza la misma lista.
          </p>
        </div>
      ) : (
        data?.competitors.map((c) => (
          <DomainDetail
            key={c.domain}
            label="Competidor"
            domain={c.domain}
            snapshot={c.snapshot}
            analyzing={analyzingDomain === c.domain}
            onAnalyze={() => handleAnalyze(c.domain)}
          />
        ))
      )}
    </div>
  );
}
