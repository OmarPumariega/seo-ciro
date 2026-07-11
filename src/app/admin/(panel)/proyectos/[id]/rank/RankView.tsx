"use client";

import { useEffect, useState } from "react";
import * as Select from "@radix-ui/react-select";
import {
  Loader2,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  Trash2,
  RefreshCw,
  Plus,
  ArrowDownToLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RankPosition = { id: string; checkedAt: string; position: number | null; url: string | null };

type RankKeyword = {
  id: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
  frequency: string;
  lastPosition: number | null;
  bestPosition: number | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  positions: RankPosition[];
};

type StudyListItem = { id: string; name: string; _count: { keywords: number }; hasStructure: boolean };

const FREQUENCY_LABELS: Record<string, string> = {
  manual: "Manual",
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
};

// Sparkline SVG inline (sin librería de gráficos, mismo principio "sin
// dependencia" que el árbol de URLs del Módulo). position null (fuera del
// top-100) se dibuja en el fondo del gráfico (peor caso).
function PositionSparkline({ positions }: { positions: RankPosition[] }) {
  const data = positions
    .filter((p) => p.position !== null)
    .map((p) => p.position as number);
  if (data.length < 2) {
    return <span className="text-xs text-gray-400">Sin histórico suficiente</span>;
  }

  const W = 240;
  const H = 60;
  const PAD = 6;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  // En SEO, mejor posición = número más bajo. Invertimos el eje Y para que
  // "subir" en el gráfico signifique mejorar (posición 1 arriba).
  const x = (i: number) => PAD + (i / (data.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + ((v - min) / range) * (H - 2 * PAD);

  const points = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={W} height={H} className="text-gray-300">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} />
      {data.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.5} className="fill-gray-700" />
      ))}
    </svg>
  );
}

function TrendIcon({ kw }: { kw: RankKeyword }) {
  const last = kw.lastPosition;
  // positions viene ordenado desc ([0]=más reciente, [1]=anterior). Pero
  // lastPosition ya es [0]; usamos positions para el anterior.
  const prev = kw.positions[1]?.position ?? null;
  if (last === null || prev === null) {
    return <Minus className="h-3.5 w-3.5 text-gray-300" />;
  }
  if (last < prev) {
    // número más bajo = mejor → flecha verde "subiendo"
    return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
  }
  if (last > prev) {
    return <TrendingDown className="h-3.5 w-3.5 text-red-600" />;
  }
  return <Minus className="h-3.5 w-3.5 text-gray-400" />;
}

export default function RankView({ projectId }: { projectId: string }) {
  const [keywords, setKeywords] = useState<RankKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newKeyword, setNewKeyword] = useState("");
  const [newDevice, setNewDevice] = useState("desktop");
  const [newFrequency, setNewFrequency] = useState("weekly");
  const [adding, setAdding] = useState(false);

  const [studies, setStudies] = useState<StudyListItem[]>([]);
  const [importStudyId, setImportStudyId] = useState("");
  const [importing, setImporting] = useState(false);

  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<RankPosition[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  function loadKeywords() {
    return fetch(`/api/proyectos/${projectId}/rank/keywords`)
      .then((r) => r.json())
      .then((d: RankKeyword[]) => {
        if (Array.isArray(d)) setKeywords(d);
      });
  }

  useEffect(() => {
    Promise.all([
      loadKeywords(),
      fetch(`/api/proyectos/${projectId}/keywords/estudios`).then((r) => r.json()),
    ]).then(([, s]) => {
      if (Array.isArray(s)) setStudies(s as StudyListItem[]);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Carga el histórico de una keyword. Se invoca desde el click de selección
  // (no desde un effect) para evitar el patrón setState-dentro-de-effect.
  async function loadHistory(kwId: string) {
    setLoadingHistory(true);
    try {
      const d: RankPosition[] = await fetch(
        `/api/proyectos/${projectId}/rank/keywords/${kwId}/historico`
      ).then((r) => r.json());
      if (Array.isArray(d)) setHistory(d);
    } finally {
      setLoadingHistory(false);
    }
  }

  function selectKeyword(kwId: string) {
    setSelectedId((prev) => {
      const next = prev === kwId ? null : kwId;
      setHistory([]);
      if (next) loadHistory(next);
      return next;
    });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAdding(true);
    const res = await fetch(`/api/proyectos/${projectId}/rank/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: newKeyword, device: newDevice, frequency: newFrequency }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      setError(data.error ?? "Error al añadir la keyword");
      return;
    }
    setNewKeyword("");
    loadKeywords();
  }

  async function handleImport() {
    setError("");
    if (!importStudyId) {
      setError("Selecciona un estudio");
      return;
    }
    setImporting(true);
    const res = await fetch(`/api/proyectos/${projectId}/rank/importar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studyId: importStudyId, device: newDevice, frequency: newFrequency }),
    });
    const data = await res.json();
    setImporting(false);
    if (!res.ok) {
      setError(data.error ?? "Error al importar");
      return;
    }
    setError("");
    setImportStudyId("");
    await loadKeywords();
    // Deja constancia del resultado en lugar de un error.
    setErrorFor("import", `${data.created} importadas · ${data.skipped} ya seguidas`);
  }

  function setErrorFor(_kind: string, msg: string) {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  }

  async function handleCheck(kwId: string) {
    setError("");
    setCheckingId(kwId);
    const res = await fetch(`/api/proyectos/${projectId}/rank/keywords/${kwId}/check`, {
      method: "POST",
    });
    const data = await res.json();
    setCheckingId(null);
    if (!res.ok) {
      setError(data.error ?? "Error al comprobar la posición");
      return;
    }
    await loadKeywords();
    if (selectedId === kwId) {
      await loadHistory(kwId);
    }
  }

  async function handleFrequency(kwId: string, frequency: string) {
    await fetch(`/api/proyectos/${projectId}/rank/keywords/${kwId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frequency }),
    });
    loadKeywords();
  }

  async function handleDelete(kwId: string) {
    if (selectedId === kwId) {
      setSelectedId(null);
      setHistory([]);
    }
    await fetch(`/api/proyectos/${projectId}/rank/keywords/${kwId}`, { method: "DELETE" });
    loadKeywords();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Rank Tracking</h2>
        <p className="text-sm text-gray-500 mt-1">
          Seguimiento de posiciones orgánicas (top-100) vía DataForSEO SERP. &laquo;Comprobar ahora&raquo; es
          instantáneo; las frecuencias programadas las revisa el cron en segundo plano.
        </p>
      </div>

      {/* Añadir keyword */}
      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Keyword a seguir</label>
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="abogado de familia madrid"
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Dispositivo</label>
              <Select.Root value={newDevice} onValueChange={setNewDevice}>
                <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
                  <Select.Value />
                  <Select.Icon><ChevronDown className="h-4 w-4 text-gray-400" /></Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                    <Select.Viewport>
                      <Select.Item value="desktop" className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"><Select.ItemText>Desktop</Select.ItemText></Select.Item>
                      <Select.Item value="mobile" className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"><Select.ItemText>Móvil</Select.ItemText></Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Frecuencia</label>
              <Select.Root value={newFrequency} onValueChange={setNewFrequency}>
                <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
                  <Select.Value />
                  <Select.Icon><ChevronDown className="h-4 w-4 text-gray-400" /></Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                    <Select.Viewport>
                      {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                        <Select.Item key={v} value={v} className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"><Select.ItemText>{l}</Select.ItemText></Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </div>
        </div>
        {error && <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">{error}</p>}
        <button
          type="submit"
          disabled={adding}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Añadir a seguimiento
        </button>
      </form>

      {/* Importar desde estudio */}
      {studies.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Importar desde un estudio</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="block text-xs font-medium text-gray-500">Estudio (Módulo 1)</label>
              <Select.Root value={importStudyId} onValueChange={setImportStudyId}>
                <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
                  <Select.Value placeholder="Selecciona un estudio" />
                  <Select.Icon><ChevronDown className="h-4 w-4 text-gray-400" /></Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50 max-h-60">
                    <Select.Viewport>
                      {studies.map((s) => (
                        <Select.Item key={s.id} value={s.id} className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100">
                          <Select.ItemText>{s.name} ({s._count.keywords})</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              Importar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">Keywords en seguimiento</h3>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : keywords.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no sigues ninguna keyword para este proyecto.</p>
        ) : (
          <div className="space-y-2">
            {keywords.map((kw) => (
              <div
                key={kw.id}
                className={cn(
                  "bg-white rounded-lg border p-3 transition-colors",
                  selectedId === kw.id ? "border-gray-900" : "border-gray-100"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => selectKeyword(kw.id)} className="text-left min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900 truncate">{kw.keyword}</span>
                      <TrendIcon kw={kw} />
                    </div>
                    <p className="text-xs text-gray-400">
                      {kw.device === "mobile" ? "Móvil" : "Desktop"} · {kw.languageCode.toUpperCase()}/{kw.locationCode}
                      {kw.lastCheckedAt && <> · {new Date(kw.lastCheckedAt).toLocaleDateString("es-ES")}</>}
                    </p>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900 tabular-nums">
                        {kw.lastPosition === null ? <span className="text-gray-300">—</span> : `#${kw.lastPosition}`}
                      </div>
                      {kw.bestPosition !== null && (
                        <div className="text-[11px] text-gray-400">mejor #{kw.bestPosition}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleCheck(kw.id)}
                      disabled={checkingId === kw.id}
                      className="p-1.5 text-gray-400 hover:text-gray-900 disabled:opacity-50"
                      title="Comprobar ahora"
                    >
                      {checkingId === kw.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(kw.id)}
                      className="p-1.5 text-gray-300 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {selectedId === kw.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Frecuencia:</label>
                      <Select.Root value={kw.frequency} onValueChange={(v) => handleFrequency(kw.id, v)}>
                        <Select.Trigger className="flex items-center justify-between px-2 py-1 border border-gray-200 rounded text-xs outline-none focus:border-gray-400 bg-white gap-1">
                          <Select.Value />
                          <ChevronDown className="h-3 w-3 text-gray-400" />
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                            <Select.Viewport>
                              {Object.entries(FREQUENCY_LABELS).map(([v, l]) => (
                                <Select.Item key={v} value={v} className="px-3 py-1.5 text-xs text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"><Select.ItemText>{l}</Select.ItemText></Select.Item>
                              ))}
                            </Select.Viewport>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>

                    {loadingHistory ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    ) : history.length === 0 ? (
                      <p className="text-xs text-gray-400">Sin mediciones todavía. Pulsa &laquo;Comprobar ahora&raquo;.</p>
                    ) : (
                      <div className="space-y-2">
                        <PositionSparkline positions={history} />
                        <div className="max-h-40 overflow-y-auto">
                          <table className="w-full text-xs">
                            <tbody>
                              {history.slice().reverse().map((p) => (
                                <tr key={p.id} className="border-b border-gray-50">
                                  <td className="py-1 text-gray-500">{new Date(p.checkedAt).toLocaleString("es-ES")}</td>
                                  <td className="py-1 text-right text-gray-900 tabular-nums">
                                    {p.position === null ? <span className="text-gray-300">fuera top-100</span> : `#${p.position}`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
