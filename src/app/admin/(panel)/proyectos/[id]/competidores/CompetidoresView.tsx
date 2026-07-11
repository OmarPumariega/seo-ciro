"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Plus, Trash2, Target, TrendingUp, AlertTriangle } from "lucide-react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

type TopKeyword = { keyword: string; position: number | null; volume: number | null };

type Snapshot = {
  id: string;
  domain: string;
  organicTraffic: number | null;
  organicKeywords: number | null;
  topKeywords: TopKeyword[] | null;
  fetchedAt: string;
} | null;

type Competitor = {
  id: string;
  domain: string;
  contentGap: TopKeyword[] | null;
  contentGapAt: string | null;
  snapshot: Snapshot;
};

type Data = {
  projectDomain: string | null;
  projectSnapshot: Snapshot;
  competitors: Competitor[];
};

function fmtTraffic(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}

function TrafficSparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const W = 200;
  const H = 48;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / range) * H;
  const pts = points.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={W} height={H} className="text-gray-300">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function TopKeywords({ keywords, title }: { keywords: TopKeyword[] | null; title: string }) {
  if (!keywords || keywords.length === 0) {
    return <p className="text-xs text-gray-400">{title}: sin datos aún.</p>;
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {keywords.slice(0, 12).map((k, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-gray-50 text-gray-600">
            {k.keyword}
            {k.volume !== null && <span className="text-gray-400">· {k.volume.toLocaleString("es-ES")}</span>}
            {k.position !== null && <span className="text-gray-400">· #{k.position}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CompetidoresView({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addDomain, setAddDomain] = useState("");
  const [analyzingDomain, setAnalyzingDomain] = useState<string | null>(null);
  const [gapId, setGapId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [trend, setTrend] = useState<number[]>([]);

  function load() {
    return fetch(`/api/proyectos/${projectId}/competidores`)
      .then((r) => r.json())
      .then((d: Data) => {
        if (d && d.competitors) setData(d);
      });
  }

  useEffect(() => {
    Promise.all([
      load(),
      fetch(`/api/proyectos/${projectId}/competidores/tendencia`).then((r) => r.json()),
    ]).then(([, t]) => {
      if (Array.isArray(t)) setTrend((t as { organicTraffic: number | null }[]).map((x) => x.organicTraffic ?? 0));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/proyectos/${projectId}/competidores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: addDomain }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Error al añadir");
      return;
    }
    setAddDomain("");
    load();
  }

  async function handleAnalyze(domain: string) {
    setError("");
    setAnalyzingDomain(domain);
    const res = await fetch(`/api/proyectos/${projectId}/competidores/analizar`, {
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
    await load();
    // refresca tendencia si era el dominio del proyecto
    if (data?.projectDomain === domain) {
      const t = await fetch(`/api/proyectos/${projectId}/competidores/tendencia?domain=${encodeURIComponent(domain)}`).then((r) => r.json());
      if (Array.isArray(t)) setTrend((t as { organicTraffic: number | null }[]).map((x) => x.organicTraffic ?? 0));
    }
  }

  async function handleGap(competitorId: string) {
    setError("");
    setGapId(competitorId);
    const res = await fetch(`/api/proyectos/${projectId}/competidores/${competitorId}/content-gap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const d = await res.json();
    setGapId(null);
    if (!res.ok) {
      setError(d.error ?? "Error al calcular content gap");
      return;
    }
    load();
  }

  async function handleRemove(competitorId: string) {
    setRemoving(true);
    await fetch(`/api/proyectos/${projectId}/competidores/${competitorId}`, { method: "DELETE" });
    setRemoving(false);
    setConfirmRemoveId(null);
    load();
  }

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-gray-400" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Competidores</h2>
        <p className="text-sm text-gray-500 mt-1">
          Espía el tráfico orgánico estimado y las keywords de cualquier dominio (DataForSEO Labs), y
          descubre el content gap: keywords por las que ranquean y tú no.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Visibilidad del propio dominio */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Tu visibilidad {data?.projectDomain ? `· ${data.projectDomain}` : ""}</h3>
          <button
            onClick={() => data?.projectDomain && handleAnalyze(data.projectDomain)}
            disabled={!data?.projectDomain || analyzingDomain === data?.projectDomain}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {analyzingDomain === data?.projectDomain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Analizar
          </button>
        </div>
        {!data?.projectDomain ? (
          <p className="text-sm text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> Define el dominio del proyecto en su ficha para analizar su visibilidad.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-semibold text-gray-900">{fmtTraffic(data?.projectSnapshot?.organicTraffic ?? null)}</div>
              <div className="text-sm text-gray-500">Tráfico orgánico (est. mensual)</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-gray-900">{data?.projectSnapshot?.organicKeywords?.toLocaleString("es-ES") ?? "—"}</div>
              <div className="text-sm text-gray-500">Keywords orgánicas</div>
            </div>
            <div className="flex flex-col items-start">
              {trend.length >= 2 ? (
                <>
                  <TrafficSparkline points={trend} />
                  <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                    <TrendingUp className="h-3 w-3" /> {trend.length} análisis
                  </span>
                </>
              ) : (
                <span className="text-xs text-gray-400">Tendencia al acumular análisis</span>
              )}
            </div>
          </div>
        )}
        {data?.projectSnapshot && (
          <TopKeywords keywords={data.projectSnapshot.topKeywords} title="Tus top keywords" />
        )}
      </div>

      {/* Añadir competidor */}
      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-100 p-5 flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <label className="block text-sm font-medium text-gray-700">Añadir competidor</label>
          <input
            type="text"
            value={addDomain}
            onChange={(e) => setAddDomain(e.target.value)}
            placeholder="competidor.com"
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>
        <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800">
          <Plus className="h-4 w-4" /> Añadir
        </button>
      </form>

      {/* Lista de competidores */}
      <div className="space-y-3">
        {data?.competitors.length === 0 && <p className="text-sm text-gray-500">Aún no hay competidores. Añade uno para espiar su visibilidad.</p>}
        {data?.competitors.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{c.domain}</p>
                <div className="flex gap-4 mt-1 text-xs text-gray-500">
                  <span>Tráfico: <strong className="text-gray-700">{fmtTraffic(c.snapshot?.organicTraffic ?? null)}</strong></span>
                  <span>Keywords: <strong className="text-gray-700">{c.snapshot?.organicKeywords?.toLocaleString("es-ES") ?? "—"}</strong></span>
                  {c.snapshot && <span>· {new Date(c.snapshot.fetchedAt).toLocaleDateString("es-ES")}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleAnalyze(c.domain)}
                  disabled={analyzingDomain === c.domain}
                  className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  title="Analizar visibilidad"
                >
                  {analyzingDomain === c.domain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Analizar
                </button>
                <button
                  onClick={() => handleGap(c.id)}
                  disabled={gapId === c.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  title="Content gap"
                >
                  {gapId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
                  Gap
                </button>
                <button onClick={() => setConfirmRemoveId(c.id)} className="p-1.5 text-gray-300 hover:text-red-600" title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {c.snapshot?.topKeywords && <TopKeywords keywords={c.snapshot.topKeywords} title="Sus top keywords" />}
            {c.contentGap && c.contentGap.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1.5">
                  Content gap ({c.contentGap.length}) — ranquea por estas y tú no {c.contentGapAt ? `· {new Date(c.contentGapAt).toLocaleDateString("es-ES")}` : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {c.contentGap.slice(0, 20).map((k, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                      {k.keyword}
                      {k.volume !== null && <span className="text-emerald-500">· {k.volume.toLocaleString("es-ES")}</span>}
                      {k.position !== null && <span className="text-emerald-500">· #{k.position}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmRemoveId !== null}
        title="¿Dejar de trackear este competidor?"
        description="Se borra su histórico de visibilidad y content gap guardados. No se puede deshacer."
        busy={removing}
        onCancel={() => setConfirmRemoveId(null)}
        onConfirm={() => confirmRemoveId && handleRemove(confirmRemoveId)}
      />
    </div>
  );
}
