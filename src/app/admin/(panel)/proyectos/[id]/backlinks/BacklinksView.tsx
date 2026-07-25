"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, ChevronDown, ChevronUp, ExternalLink, ShieldAlert, Filter, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { backlinkAnalysisCostUsd } from "@/lib/dataforseo/pricing";

// TODOS los campos que devuelve /v3/backlinks/backlinks/live — antes solo se
// mostraban 6, el resto se pedía y se tiraba. Nada se muestra que no venga
// real de la API; lo que no llega, queda null.
type TopBacklink = {
  urlFrom: string | null;
  urlFromHttps: boolean | null;
  domainFrom: string | null;
  domainFromRank: number | null;
  pageFromRank: number | null;
  domainFromPlatformType: string[] | null;
  domainFromIsIp: boolean | null;
  urlTo: string | null;
  domainTo: string | null;
  tldFrom: string | null;
  anchor: string | null;
  dofollow: boolean | null;
  textPre: string | null;
  textPost: string | null;
  semanticLocation: string | null;
  linksCount: number | null;
  groupCount: number | null;
  isNew: boolean | null;
  isLost: boolean | null;
  isBroken: boolean | null;
  isIndirectLink: boolean | null;
  urlToStatusCode: number | null;
  backlinkSpamScore: number | null;
  pageFromExternalLinks: number | null;
  pageFromInternalLinks: number | null;
  pageFromSize: number | null;
  pageFromEncoding: string | null;
  pageFromLanguage: string | null;
  pageFromTitle: string | null;
  firstSeen: string | null;
  prevSeen: string | null;
  lastSeen: string | null;
  itemType: string | null;
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

const LIMIT_OPTIONS = [20, 50, 100, 200, 500] as const;

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

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

// "Tus páginas con más enlaces entrantes" — agrupa por urlTo, cuenta.
function topTargetPages(items: TopBacklink[]): { url: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const b of items) {
    if (!b.urlTo) continue;
    counts.set(b.urlTo, (counts.get(b.urlTo) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// "Páginas de origen con más autoridad" — autoridad a nivel de PÁGINA
// (pageFromRank), no de dominio, así que puede destacar una página muy
// concreta de un dominio con autoridad media.
function topReferringPages(items: TopBacklink[]): TopBacklink[] {
  return [...items]
    .filter((b) => b.pageFromRank !== null)
    .sort((a, b) => (b.pageFromRank ?? 0) - (a.pageFromRank ?? 0))
    .slice(0, 10);
}

type GapDomain = { domain: string; rank: number | null; count: number; exampleUrlFrom: string | null };

// Gap de dominios de referencia — mismo concepto que el content gap de
// Competidores (keywords que rankea el competidor y el proyecto no), pero
// para enlaces: dominios que enlazan al competidor y no al proyecto. Se
// calcula por completo a partir de los backlinks YA analizados y guardados
// (topBacklinks de ambos snapshots) — sin ninguna llamada nueva a
// DataForSEO, tal como se pidió explícitamente.
function backlinkGap(own: Snapshot, competitor: Snapshot): GapDomain[] {
  if (!own?.topBacklinks || !competitor?.topBacklinks) return [];
  const ownDomains = new Set(
    own.topBacklinks.map((b) => b.domainFrom).filter((d): d is string => d !== null)
  );
  const byDomain = new Map<string, GapDomain>();
  for (const b of competitor.topBacklinks) {
    if (!b.domainFrom || ownDomains.has(b.domainFrom)) continue;
    const existing = byDomain.get(b.domainFrom);
    if (existing) {
      existing.count++;
      if ((b.domainFromRank ?? -1) > (existing.rank ?? -1)) {
        existing.rank = b.domainFromRank;
        existing.exampleUrlFrom = b.urlFrom;
      }
    } else {
      byDomain.set(b.domainFrom, {
        domain: b.domainFrom,
        rank: b.domainFromRank,
        count: 1,
        exampleUrlFrom: b.urlFrom,
      });
    }
  }
  return Array.from(byDomain.values()).sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1));
}

function BacklinkGapCard({
  ownSnapshot,
  competitorSnapshot,
  competitorDomain,
}: {
  ownSnapshot: Snapshot;
  competitorSnapshot: Snapshot;
  competitorDomain: string;
}) {
  const gap = useMemo(
    () => backlinkGap(ownSnapshot, competitorSnapshot),
    [ownSnapshot, competitorSnapshot]
  );

  if (!ownSnapshot || !competitorSnapshot) return null; // falta analizar alguno de los dos — sin ruido

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">
          Dominios que enlazan a {competitorDomain} y no a ti ({gap.length})
        </h3>
      </div>
      {gap.length === 0 ? (
        <p className="text-xs text-gray-500">
          Sin dominios exclusivos de {competitorDomain} entre los backlinks ya analizados.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-1.5 pr-2 font-medium">Dominio</th>
                <th className="py-1.5 pr-2 font-medium text-right">Autoridad</th>
                <th className="py-1.5 pr-2 font-medium text-right">Backlinks encontrados</th>
                <th className="py-1.5 pr-2 font-medium">Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              {gap.map((g) => (
                <tr key={g.domain} className="border-b border-gray-50 last:border-0">
                  <td className="py-1.5 pr-2 text-gray-900">{g.domain}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">{g.rank ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-gray-500">{g.count}</td>
                  <td className="py-1.5 pr-2">
                    {g.exampleUrlFrom ? (
                      <a
                        href={g.exampleUrlFrom}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
                      >
                        <span className="truncate max-w-[220px] inline-block align-bottom">{g.exampleUrlFrom}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        Basado en los backlinks ya analizados de cada dominio (hasta el límite elegido al
        analizar) — no es necesariamente el listado completo.
      </p>
    </div>
  );
}

function BacklinkRow({ b }: { b: TopBacklink }) {
  const [expanded, setExpanded] = useState(false);
  const days = daysAgo(b.lastSeen ?? b.firstSeen);
  return (
    <>
      <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="py-1.5 pr-2 text-gray-900">
          {b.urlFrom ? (
            <a
              href={b.urlFrom}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
            >
              <span className="truncate max-w-[200px] inline-block align-bottom">{b.domainFrom ?? b.urlFrom}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            b.domainFrom ?? "—"
          )}
        </td>
        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">{b.domainFromRank ?? "—"}</td>
        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-500">{b.pageFromRank ?? "—"}</td>
        <td className="py-1.5 pr-2 text-gray-600 truncate max-w-[160px]">{b.anchor || "—"}</td>
        <td className="py-1.5 pr-2 text-gray-500">{b.dofollow === false ? "nofollow" : "dofollow"}</td>
        <td className="py-1.5 pr-2">
          {b.isBroken || (b.urlToStatusCode && b.urlToStatusCode >= 400) ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">
              roto{b.urlToStatusCode ? ` (${b.urlToStatusCode})` : ""}
            </span>
          ) : b.urlToStatusCode && b.urlToStatusCode >= 300 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
              redirección ({b.urlToStatusCode})
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
              {b.urlToStatusCode ?? "OK"}
            </span>
          )}
        </td>
        <td className="py-1.5 pr-2 text-gray-400">{days !== null ? `hace ${days}d` : "—"}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-50 last:border-0 bg-gray-50/40">
          <td colSpan={7} className="p-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px] text-gray-600">
              <div><span className="text-gray-400">Página destino:</span> {b.urlTo ?? "—"}</div>
              <div><span className="text-gray-400">TLD origen:</span> {b.tldFrom ?? "—"}</div>
              <div><span className="text-gray-400">HTTPS origen:</span> {b.urlFromHttps === null ? "—" : b.urlFromHttps ? "sí" : "no"}</div>
              <div><span className="text-gray-400">Es IP:</span> {b.domainFromIsIp === null ? "—" : b.domainFromIsIp ? "sí" : "no"}</div>
              <div><span className="text-gray-400">Nuevo:</span> {b.isNew === null ? "—" : b.isNew ? "sí" : "no"}</div>
              <div><span className="text-gray-400">Perdido:</span> {b.isLost === null ? "—" : b.isLost ? "sí" : "no"}</div>
              <div><span className="text-gray-400">Enlace indirecto:</span> {b.isIndirectLink === null ? "—" : b.isIndirectLink ? "sí" : "no"}</div>
              <div><span className="text-gray-400">Spam score:</span> {b.backlinkSpamScore ?? "—"}</div>
              <div><span className="text-gray-400">Nº enlaces en la página:</span> {b.linksCount ?? "—"}</div>
              <div><span className="text-gray-400">Grupo de enlaces:</span> {b.groupCount ?? "—"}</div>
              <div><span className="text-gray-400">Enlaces externos página origen:</span> {b.pageFromExternalLinks ?? "—"}</div>
              <div><span className="text-gray-400">Enlaces internos página origen:</span> {b.pageFromInternalLinks ?? "—"}</div>
              <div><span className="text-gray-400">Tamaño página origen:</span> {b.pageFromSize ?? "—"}</div>
              <div><span className="text-gray-400">Idioma página origen:</span> {b.pageFromLanguage ?? "—"}</div>
              <div><span className="text-gray-400">Codificación:</span> {b.pageFromEncoding ?? "—"}</div>
              <div><span className="text-gray-400">Primera vez visto:</span> {b.firstSeen ? new Date(b.firstSeen).toLocaleDateString("es-ES") : "—"}</div>
              <div><span className="text-gray-400">Última vez visto:</span> {b.lastSeen ? new Date(b.lastSeen).toLocaleDateString("es-ES") : "—"}</div>
              <div><span className="text-gray-400">Visto anteriormente:</span> {b.prevSeen ? new Date(b.prevSeen).toLocaleDateString("es-ES") : "—"}</div>
              <div><span className="text-gray-400">Tipo de item:</span> {b.itemType ?? "—"}</div>
              <div><span className="text-gray-400">Plataforma origen:</span> {b.domainFromPlatformType?.join(", ") || "—"}</div>
              {b.pageFromTitle && <div className="col-span-2 sm:col-span-4"><span className="text-gray-400">Título página origen:</span> {b.pageFromTitle}</div>}
              {(b.textPre || b.textPost) && (
                <div className="col-span-2 sm:col-span-4">
                  <span className="text-gray-400">Contexto del enlace:</span> {b.textPre} <strong>[enlace]</strong> {b.textPost}
                </div>
              )}
              {b.semanticLocation && <div className="col-span-2 sm:col-span-4"><span className="text-gray-400">Ubicación semántica:</span> {b.semanticLocation}</div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
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
  onAnalyze: (limit: number | "all") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState<number | "all">(20);
  const [minAuthority, setMinAuthority] = useState(0);
  const [maxDaysAgo, setMaxDaysAgo] = useState<number | null>(null);
  const [dofollowOnly, setDofollowOnly] = useState(false);

  const items = snapshot?.topBacklinks ?? [];
  const filtered = useMemo(() => {
    return items.filter((b) => {
      if ((b.domainFromRank ?? 0) < minAuthority) return false;
      if (dofollowOnly && b.dofollow === false) return false;
      if (maxDaysAgo !== null) {
        const d = daysAgo(b.lastSeen ?? b.firstSeen);
        if (d === null || d > maxDaysAgo) return false;
      }
      return true;
    });
  }, [items, minAuthority, maxDaysAgo, dofollowOnly]);

  const targetPages = useMemo(() => topTargetPages(items), [items]);
  const referringPages = useMemo(() => topReferringPages(items), [items]);

  const estimatedCost =
    limit === "all"
      ? snapshot?.backlinksTotal
        ? backlinkAnalysisCostUsd(snapshot.backlinksTotal)
        : null
      : backlinkAnalysisCostUsd(limit);

  function handleAnalyzeClick() {
    if (limit === "all") {
      const msg = estimatedCost
        ? `Se pedirán los ${snapshot?.backlinksTotal?.toLocaleString("es-ES")} backlinks reales de este dominio — coste estimado ~$${estimatedCost.toFixed(2)}. ¿Continuar?`
        : "No se conoce el total de backlinks todavía (primer análisis) — el coste puede ser alto en dominios grandes. ¿Continuar?";
      if (!window.confirm(msg)) return;
    }
    onAnalyze(limit);
  }

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
        <div className="flex items-center gap-2">
          <select
            value={String(limit)}
            onChange={(e) => setLimit(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-gray-400 bg-white"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>Top {n}</option>
            ))}
            <option value="all">Todos</option>
          </select>
          <button
            onClick={handleAnalyzeClick}
            disabled={analyzing}
            title={estimatedCost ? `Coste estimado ~$${estimatedCost.toFixed(2)}` : "Coste según cantidad real"}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Analizar {estimatedCost != null && <span className="opacity-70">~${estimatedCost.toFixed(2)}</span>}
          </button>
        </div>
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
            {items.length > 0 && <> · {items.length} backlinks individuales cargados</>}
          </p>

          {(targetPages.length > 0 || referringPages.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {targetPages.length > 0 && (
                <div className="border border-gray-100 rounded-lg p-2.5">
                  <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Tus páginas con más enlaces entrantes</p>
                  <ul className="space-y-1">
                    {targetPages.map((p) => (
                      <li key={p.url} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-gray-700 truncate">{p.url}</span>
                        <span className="text-gray-400 shrink-0">{p.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {referringPages.length > 0 && (
                <div className="border border-gray-100 rounded-lg p-2.5">
                  <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Páginas de origen con más autoridad</p>
                  <ul className="space-y-1">
                    {referringPages.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-gray-700 truncate">{p.urlFrom ?? p.domainFrom ?? "—"}</span>
                        <span className="text-gray-400 shrink-0">{p.pageFromRank}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {items.length > 0 && (
            <div>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Todos los backlinks ({items.length})
              </button>
              {expanded && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    <Filter className="h-3.5 w-3.5 text-gray-400" />
                    <label className="flex items-center gap-1.5">
                      Autoridad mín.
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={minAuthority}
                        onChange={(e) => setMinAuthority(Number(e.target.value) || 0)}
                        className="w-16 px-1.5 py-0.5 border border-gray-200 rounded text-xs outline-none focus:border-gray-400"
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      Visto en los últimos
                      <select
                        value={maxDaysAgo ?? ""}
                        onChange={(e) => setMaxDaysAgo(e.target.value ? Number(e.target.value) : null)}
                        className="px-1.5 py-0.5 border border-gray-200 rounded text-xs outline-none focus:border-gray-400 bg-white"
                      >
                        <option value="">cualquier fecha</option>
                        <option value="30">30 días</option>
                        <option value="90">90 días</option>
                        <option value="365">1 año</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={dofollowOnly} onChange={(e) => setDofollowOnly(e.target.checked)} className="h-3.5 w-3.5" />
                      Solo dofollow
                    </label>
                    <span className="text-gray-400">{filtered.length} de {items.length}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-400 border-b border-gray-100">
                          <th className="py-1.5 pr-2 font-medium">Origen</th>
                          <th className="py-1.5 pr-2 font-medium text-right">Autoridad dominio</th>
                          <th className="py-1.5 pr-2 font-medium text-right">Autoridad página</th>
                          <th className="py-1.5 pr-2 font-medium">Anchor</th>
                          <th className="py-1.5 pr-2 font-medium">Tipo</th>
                          <th className="py-1.5 pr-2 font-medium">Estado</th>
                          <th className="py-1.5 pr-2 font-medium">Visto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((b, i) => (
                          <BacklinkRow key={i} b={b} />
                        ))}
                      </tbody>
                    </table>
                  </div>
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

  async function handleAnalyze(domain: string, limit: number | "all") {
    setError("");
    setAnalyzingDomain(domain);
    const res = await fetch(`/api/proyectos/${projectId}/backlinks/analizar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, limit }),
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
        onAnalyze={(limit) => data?.projectDomain && handleAnalyze(data.projectDomain, limit)}
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
          <Fragment key={c.domain}>
            <DomainDetail
              label="Competidor"
              domain={c.domain}
              snapshot={c.snapshot}
              analyzing={analyzingDomain === c.domain}
              onAnalyze={(limit) => handleAnalyze(c.domain, limit)}
            />
            <BacklinkGapCard
              ownSnapshot={data.projectSnapshot}
              competitorSnapshot={c.snapshot}
              competitorDomain={c.domain}
            />
          </Fragment>
        ))
      )}
    </div>
  );
}
