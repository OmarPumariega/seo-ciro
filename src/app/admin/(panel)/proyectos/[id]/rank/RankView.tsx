"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import * as Select from "@radix-ui/react-select";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  TrendingUp,
  TrendingDown,
  Minus,
  Trash2,
  RefreshCw,
  Plus,
  ArrowDownToLine,
  Search,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { rankMonthlyCostUsd } from "@/lib/dataforseo/pricing";

type RankPosition = { id: string; checkedAt: string; position: number | null; url: string | null };

type RankKeyword = {
  id: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
  frequency: string;
  depth: number;
  lastPosition: number | null;
  bestPosition: number | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  positions: RankPosition[];
  searchVolume: number | null;
  group: string | null;
};

type SortKey = "keyword" | "volume" | "position" | "best";

type StudyListItem = { id: string; name: string; _count: { keywords: number }; hasStructure: boolean };

const FREQUENCY_LABELS: Record<string, string> = {
  manual: "Manual",
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
};

const DEPTHS = [10, 30, 50, 100];
const MAX_DATE_COLUMNS = 8;

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

// Escala de color por posición — misma idea que scoring.ts en Auditoría:
// explicable y con umbrales fijos, nunca una caja negra. "Sin chequeo" (n/s)
// se distingue de "chequeado pero fuera del depth" (—): son señales distintas.
function positionCell(position: number | null | undefined, checked: boolean): { bg: string; text: string; label: string } {
  if (!checked) return { bg: "bg-gray-50", text: "text-gray-300", label: "n/s" };
  if (position === null || position === undefined) return { bg: "bg-red-50", text: "text-red-500", label: "—" };
  if (position <= 3) return { bg: "bg-emerald-200", text: "text-emerald-900", label: String(position) };
  if (position <= 10) return { bg: "bg-emerald-50", text: "text-emerald-700", label: String(position) };
  if (position <= 20) return { bg: "bg-amber-50", text: "text-amber-700", label: String(position) };
  if (position <= 50) return { bg: "bg-orange-50", text: "text-orange-700", label: String(position) };
  return { bg: "bg-red-50", text: "text-red-600", label: String(position) };
}

function SpendBanner({ spend }: { spend: { spentUsd: number; limitUsd: number | null; blocked: boolean } | null }) {
  if (!spend) return null;
  if (spend.limitUsd === null) return null; // sin tope configurado, no mostramos nada
  const pct = Math.min(100, Math.round((spend.spentUsd / spend.limitUsd) * 100));
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm px-3 py-2 rounded-lg",
        spend.blocked ? "bg-red-50 text-red-700" : pct >= 80 ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"
      )}
    >
      Gasto DataForSEO este mes: {spend.spentUsd.toFixed(2)}$ / {spend.limitUsd.toFixed(2)}$
      {spend.blocked && " — tope alcanzado, nuevas llamadas bloqueadas"}
    </div>
  );
}

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

function SortableTh({
  label,
  sortKey,
  active,
  dir,
  onClick,
  align = "left",
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th className={cn("py-2.5 font-medium whitespace-nowrap", className)}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "flex items-center gap-1 hover:text-gray-900",
          align === "right" && "ml-auto flex-row-reverse",
          isActive ? "text-gray-900" : "text-gray-500"
        )}
      >
        {label}
        {isActive ? (
          dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-gray-300" />
        )}
      </button>
    </th>
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
  const [newDepth, setNewDepth] = useState("10");
  const [newGroup, setNewGroup] = useState("");
  const [adding, setAdding] = useState(false);

  // Búsqueda, filtro por grupo y orden — la tabla no pagina (el volumen
  // típico por proyecto no lo justifica todavía), pero sí necesita estas
  // tres cosas para no volverse inmanejable a partir de 50+ keywords.
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("__all__");
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [spend, setSpend] = useState<{ spentUsd: number; limitUsd: number | null; blocked: boolean } | null>(null);

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

  function loadSpend() {
    return fetch(`/api/dataforseo/gasto`)
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.spentUsd === "number") setSpend(d);
      });
  }

  useEffect(() => {
    Promise.all([
      loadKeywords(),
      fetch(`/api/proyectos/${projectId}/keywords/estudios`).then((r) => r.json()),
      loadSpend(),
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
      // El backend acepta { keywords: "una por línea" } (bulk) y { keyword } (legacy).
      // Mandamos siempre bulk: con una sola línea también funciona.
      body: JSON.stringify({
        keywords: newKeyword,
        device: newDevice,
        frequency: newFrequency,
        depth: Number(newDepth),
        group: newGroup,
      }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      setError(data.error ?? "Error al añadir las keywords");
      return;
    }
    // data = { added, skipped, checked, errors }. Lo dejamos 4s visible.
    const parts: string[] = [`${data.added} añadidas`];
    if (data.skipped > 0) parts.push(`${data.skipped} ya seguidas`);
    const errCount = Array.isArray(data.errors) ? data.errors.length : 0;
    if (errCount > 0) {
      const why = data.errors[0]?.error ?? "";
      parts.push(`${errCount} sin posición${why ? ` (${why})` : ""}`);
    }
    setErrorFor("add", parts.join(" · "));
    setNewKeyword("");
    await Promise.all([loadKeywords(), loadSpend()]);
  }

  async function handleGroup(kwId: string, group: string) {
    await fetch(`/api/proyectos/${projectId}/rank/keywords/${kwId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group }),
    });
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
      body: JSON.stringify({ studyId: importStudyId, device: newDevice, frequency: newFrequency, depth: Number(newDepth) }),
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
    loadSpend();
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

  async function handleDepth(kwId: string, depth: number) {
    await fetch(`/api/proyectos/${projectId}/rank/keywords/${kwId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depth }),
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

  // Estimaciones de coste (estilo WebCEO): lo que cuesta/mes lo ya seguido y
  // lo que sumará la nueva keyword o el lote importado, según depth+frecuencia
  // actuales del formulario. Se recalcula en vivo al mover los selectores.
  const projectMonthlyCost = keywords.reduce(
    (sum, kw) => sum + rankMonthlyCostUsd(1, kw.depth, kw.frequency),
    0
  );
  // Cuenta las líneas no vacías del textarea (bulk-aware). Una sola línea
  // también funciona: el coste mostrado es el de esa keyword.
  const newKeywordCount = newKeyword.split("\n").filter((l) => l.trim()).length;
  const newKeywordMonthlyCost = rankMonthlyCostUsd(newKeywordCount, Number(newDepth), newFrequency);
  const importStudy = studies.find((s) => s.id === importStudyId);
  const importBatchMonthly = importStudy
    ? rankMonthlyCostUsd(importStudy._count.keywords, Number(newDepth), newFrequency)
    : 0;

  // Columnas de fecha de la tabla tipo calendario: unión de los días con
  // algún chequeo real entre todas las keywords visibles, más recientes
  // primero, acotada para que la tabla no crezca sin límite. Nunca se
  // interpola una fecha sin chequeo — esa columna simplemente muestra "n/s"
  // para esa keyword.
  const dateColumns = useMemo(() => {
    const days = new Map<string, Date>();
    for (const kw of keywords) {
      for (const p of kw.positions) {
        const key = dayKey(p.checkedAt);
        if (!days.has(key)) days.set(key, new Date(p.checkedAt));
      }
    }
    return [...days.values()]
      .sort((a, b) => b.getTime() - a.getTime())
      .slice(0, MAX_DATE_COLUMNS)
      .reverse();
  }, [keywords]);

  function cellFor(kw: RankKeyword, date: Date) {
    const key = date.toDateString();
    // Si hay varios chequeos el mismo día, nos quedamos con el último
    // (positions ya viene ordenado desc por checkedAt).
    const match = kw.positions.find((p) => dayKey(p.checkedAt) === key);
    return positionCell(match?.position, Boolean(match));
  }

  // Grupos existentes entre las keywords ya seguidas, para el desplegable de
  // filtro — no hay tabla de grupos aparte, es texto libre por keyword.
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const kw of keywords) if (kw.group) set.add(kw.group);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [keywords]);

  const filteredKeywords = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = keywords;
    if (groupFilter === "__none__") list = list.filter((kw) => !kw.group);
    else if (groupFilter !== "__all__") list = list.filter((kw) => kw.group === groupFilter);
    if (q) list = list.filter((kw) => kw.keyword.toLowerCase().includes(q));

    const dir = sortDir === "asc" ? 1 : -1;
    const withRank = (v: number | null) => (v === null ? Infinity : v); // sin posición = siempre al final
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "keyword":
          return dir * a.keyword.localeCompare(b.keyword);
        case "volume":
          return dir * ((a.searchVolume ?? -1) - (b.searchVolume ?? -1));
        case "best":
          return dir * (withRank(a.bestPosition) - withRank(b.bestPosition));
        case "position":
        default:
          return dir * (withRank(a.lastPosition) - withRank(b.lastPosition));
      }
    });
  }, [keywords, search, groupFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "keyword" ? "asc" : "desc");
    }
  }

  // Distribución de posiciones (R4) — resumen a golpe de vista, calculado en
  // el cliente con datos ya cargados, sin ninguna llamada nueva.
  const distribution = useMemo(() => {
    const buckets = { top3: 0, top10: 0, top20: 0, top50: 0, worse: 0, none: 0 };
    for (const kw of filteredKeywords) {
      const p = kw.lastPosition;
      if (p === null) buckets.none++;
      else if (p <= 3) buckets.top3++;
      else if (p <= 10) buckets.top10++;
      else if (p <= 20) buckets.top20++;
      else if (p <= 50) buckets.top50++;
      else buckets.worse++;
    }
    return buckets;
  }, [filteredKeywords]);

  // Exportar a CSV (R6) — respeta el filtro/orden actual, sin backend: todo
  // el dato ya está cargado en el cliente.
  function exportCsv() {
    const header = ["Keyword", "Grupo", "Volumen", "Posición actual", "Mejor posición", "Dispositivo", "Frecuencia", "Última comprobación"];
    const rows = filteredKeywords.map((kw) => [
      kw.keyword,
      kw.group ?? "",
      kw.searchVolume ?? "",
      kw.lastPosition ?? "",
      kw.bestPosition ?? "",
      kw.device === "mobile" ? "Móvil" : "Desktop",
      FREQUENCY_LABELS[kw.frequency] ?? kw.frequency,
      kw.lastCheckedAt ? new Date(kw.lastCheckedAt).toLocaleDateString("es-ES") : "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rank-tracking-${projectId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Rank Tracking</h2>
        <p className="text-sm text-gray-500 mt-1">
          Seguimiento de posiciones orgánicas vía DataForSEO SERP. &laquo;Comprobar ahora&raquo; es
          instantáneo; las frecuencias programadas las revisa el cron en segundo plano.
        </p>
      </div>

      <SpendBanner spend={spend} />

      {/* Añadir keyword */}
      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Keywords a seguir (una por línea)</label>
            <textarea
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder={"abogado de familia madrid\nabogado laboralista madrid\nabogado penalista madrid"}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 resize-y"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Grupo <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="Servicios, Blog..."
                maxLength={60}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              />
            </div>
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
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700" title="Resultados a rastrear. A mayor depth, más caro.">Profundidad</label>
              <Select.Root value={newDepth} onValueChange={setNewDepth}>
                <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
                  <Select.Value />
                  <Select.Icon><ChevronDown className="h-4 w-4 text-gray-400" /></Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                    <Select.Viewport>
                      {DEPTHS.map((d) => (
                        <Select.Item key={d} value={String(d)} className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"><Select.ItemText>Top-{d}</Select.ItemText></Select.Item>
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
        <p className="text-xs text-gray-400">
          {newKeywordCount > 0
            ? <>Estas {newKeywordCount} keyword(s) costarán <strong className="text-gray-600">~${newKeywordMonthlyCost.toFixed(2)}/mes</strong> (Top-{newDepth}, {FREQUENCY_LABELS[newFrequency].toLowerCase()}).</>
            : <>Coste por keyword: <strong className="text-gray-600">~${rankMonthlyCostUsd(1, Number(newDepth), newFrequency).toFixed(2)}/mes</strong> (Top-{newDepth}, {FREQUENCY_LABELS[newFrequency].toLowerCase()}).</>}
          {" "}Total del proyecto al añadirlas: ~${(projectMonthlyCost + newKeywordMonthlyCost).toFixed(2)}/mes.
        </p>
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
          {importStudy && (
            <p className="text-xs text-gray-400">
              Importar {importStudy._count.keywords} keywords costará{" "}
              <strong className="text-gray-600">~${importBatchMonthly.toFixed(2)}/mes</strong> (Top-{newDepth}, {FREQUENCY_LABELS[newFrequency].toLowerCase()}).
            </p>
          )}
        </div>
      )}

      {/* Tabla tipo calendario */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Keywords en seguimiento {keywords.length > 0 && `(${filteredKeywords.length}/${keywords.length})`}
          </h3>
          {keywords.length > 0 && (
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-200" />Top 3</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-50 border border-emerald-100" />Top 10</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-50 border border-amber-100" />11-20</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-orange-50 border border-orange-100" />21-50</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-50 border border-red-100" />&gt;50 / fuera</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-gray-50 border border-gray-200" />n/s = sin chequeo</span>
            </div>
          )}
        </div>

        {keywords.length > 0 && (
          <>
            {/* Distribución de posiciones (R4) */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">{distribution.top3} en Top 3</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">{distribution.top10} en Top 10</span>
              <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">{distribution.top20} en 11-20</span>
              <span className="px-2.5 py-1 rounded-full bg-orange-50 text-orange-700">{distribution.top50} en 21-50</span>
              <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-600">{distribution.worse} peor de 50</span>
              <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{distribution.none} sin posicionar</span>
            </div>

            {/* Buscar / filtrar por grupo / exportar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar keyword..."
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-gray-400"
                />
              </div>
              {groups.length > 0 && (
                <Select.Root value={groupFilter} onValueChange={setGroupFilter}>
                  <Select.Trigger className="flex items-center justify-between gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-gray-400 bg-white min-w-[140px]">
                    <Select.Value />
                    <Select.Icon><ChevronDown className="h-3.5 w-3.5 text-gray-400" /></Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                      <Select.Viewport>
                        <Select.Item value="__all__" className="px-3 py-1.5 text-xs text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"><Select.ItemText>Todos los grupos</Select.ItemText></Select.Item>
                        <Select.Item value="__none__" className="px-3 py-1.5 text-xs text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"><Select.ItemText>Sin grupo</Select.ItemText></Select.Item>
                        {groups.map((g) => (
                          <Select.Item key={g} value={g} className="px-3 py-1.5 text-xs text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"><Select.ItemText>{g}</Select.ItemText></Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              )}
              <button
                type="button"
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 shrink-0"
                title="Exportar la tabla visible a CSV"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </button>
            </div>
          </>
        )}

        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : keywords.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no sigues ninguna keyword para este proyecto.</p>
        ) : filteredKeywords.length === 0 ? (
          <p className="text-sm text-gray-500">Ninguna keyword coincide con el filtro actual.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <SortableTh label="Keyword" sortKey="keyword" active={sortKey} dir={sortDir} onClick={toggleSort} className="pl-4 pr-3 sticky left-0 bg-white" />
                  <SortableTh label="Volumen" sortKey="volume" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-3" />
                  {dateColumns.map((d) => (
                    <th key={d.toISOString()} className="py-2.5 px-2 font-medium text-center whitespace-nowrap">
                      {d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                    </th>
                  ))}
                  <SortableTh label="Actual" sortKey="position" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-3" />
                  <SortableTh label="Mejor" sortKey="best" active={sortKey} dir={sortDir} onClick={toggleSort} align="right" className="px-3" />
                  <th className="py-2.5 pr-4 pl-3 font-medium text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredKeywords.map((kw) => (
                  <Fragment key={kw.id}>
                    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="py-2 pl-4 pr-3 sticky left-0 bg-white">
                        <button
                          onClick={() => selectKeyword(kw.id)}
                          className="flex items-center gap-1.5 text-left min-w-0"
                        >
                          <TrendIcon kw={kw} />
                          <span className="text-gray-900 truncate max-w-[220px]" title={kw.keyword}>
                            {kw.keyword}
                          </span>
                        </button>
                        <p className="text-[11px] text-gray-400 pl-5">
                          {kw.device === "mobile" ? "Móvil" : "Desktop"} · Top-{kw.depth}
                        </p>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-600 tabular-nums whitespace-nowrap">
                        {kw.searchVolume === null ? <span className="text-gray-300">—</span> : kw.searchVolume.toLocaleString("es-ES")}
                        {kw.group && (
                          <div className="mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 whitespace-nowrap">{kw.group}</span>
                          </div>
                        )}
                      </td>
                      {dateColumns.map((d) => {
                        const cell = cellFor(kw, d);
                        return (
                          <td key={d.toISOString()} className="p-1 text-center">
                            <span
                              className={cn(
                                "inline-flex items-center justify-center h-7 min-w-7 px-1.5 rounded-md text-xs font-medium tabular-nums",
                                cell.bg,
                                cell.text
                              )}
                            >
                              {cell.label}
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-right text-gray-900 font-medium tabular-nums whitespace-nowrap">
                        {kw.lastPosition === null ? <span className="text-gray-300 font-normal">—</span> : `#${kw.lastPosition}`}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-500 tabular-nums whitespace-nowrap">
                        {kw.bestPosition === null ? "—" : `#${kw.bestPosition}`}
                      </td>
                      <td className="py-2 pr-4 pl-3">
                        <div className="flex items-center justify-end gap-2">
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
                      </td>
                    </tr>
                    {selectedId === kw.id && (
                      <tr className="border-b border-gray-50 last:border-0 bg-gray-50/40">
                        <td colSpan={dateColumns.length + 5} className="p-4">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-4">
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500">Grupo:</label>
                                <input
                                  type="text"
                                  defaultValue={kw.group ?? ""}
                                  onBlur={(e) => {
                                    if (e.target.value !== (kw.group ?? "")) handleGroup(kw.id, e.target.value);
                                  }}
                                  placeholder="Sin grupo"
                                  maxLength={60}
                                  className="px-2 py-1 border border-gray-200 rounded text-xs outline-none focus:border-gray-400 w-32"
                                />
                              </div>
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
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500">Profundidad:</label>
                                <Select.Root value={String(kw.depth)} onValueChange={(v) => handleDepth(kw.id, Number(v))}>
                                  <Select.Trigger className="flex items-center justify-between px-2 py-1 border border-gray-200 rounded text-xs outline-none focus:border-gray-400 bg-white gap-1">
                                    <Select.Value />
                                    <ChevronDown className="h-3 w-3 text-gray-400" />
                                  </Select.Trigger>
                                  <Select.Portal>
                                    <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                                      <Select.Viewport>
                                        {DEPTHS.map((d) => (
                                          <Select.Item key={d} value={String(d)} className="px-3 py-1.5 text-xs text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"><Select.ItemText>Top-{d}</Select.ItemText></Select.Item>
                                        ))}
                                      </Select.Viewport>
                                    </Select.Content>
                                  </Select.Portal>
                                </Select.Root>
                              </div>
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
                                            {p.position === null ? <span className="text-gray-300">fuera top-{kw.depth}</span> : `#${p.position}`}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
