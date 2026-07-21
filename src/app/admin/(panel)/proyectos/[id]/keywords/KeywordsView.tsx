"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Sparkles,
  ChevronDown,
  Search,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowDownToLine,
  Download,
  Upload,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { suggestionsCostUsd } from "@/lib/dataforseo/pricing";
import { downloadCsv } from "@/lib/csv";
import LocationPicker, { type LocationValue } from "@/components/admin/LocationPicker";
import { resolveLocationName } from "@/lib/rank/locations";

type Keyword = {
  id: string;
  keyword: string;
  searchVolume: number | null;
  competition: string | null;
  cpc: number | string | null;
  intent: string | null;
  priority: number;
};

type StructurePage = {
  slug: string;
  h1: string;
  headings: string[];
  navLabel: string;
  keywords: string[];
};

type Study = {
  id: string;
  name: string;
  languageCode: string;
  locationCode: number;
  createdAt: string;
  updatedAt: string;
  structure: { pages: StructurePage[] } | null;
  structureModel: string | null;
  notes: string | null;
  keywords: Keyword[];
};

type StudyListItem = {
  id: string;
  name: string;
  languageCode: string;
  locationCode: number;
  createdAt: string;
  hasStructure: boolean;
  notes: string | null;
  _count: { keywords: number };
};

type Suggestion = {
  keyword: string;
  searchVolume: number | null;
  competition: string | null;
  cpc: number | null;
  intent: string | null;
};

const INTENT_STYLES: Record<string, string> = {
  informacional: "bg-gray-100 text-gray-600",
  mixta: "bg-amber-50 text-amber-700",
  transaccional: "bg-emerald-50 text-emerald-700",
};
const COMPETITION_STYLES: Record<string, string> = {
  HIGH: "text-red-600",
  MEDIUM: "text-amber-600",
  LOW: "text-emerald-600",
};
const LIMITS = [10, 30, 50, 100];

function fmtCpc(v: number | string | null): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? `${n.toFixed(2)}€` : "—";
}

// --- Árbol de estructura de URLs (mismo render que antes) ---
type TreeNode = { segment: string; path: string; page?: StructurePage; children: TreeNode[] };
function buildTree(pages: StructurePage[]): TreeNode[] {
  const root: TreeNode = { segment: "", path: "", children: [] };
  for (const page of pages) {
    const segments = page.slug.split("/").filter(Boolean);
    let node = root;
    let acc = "";
    segments.forEach((seg, i) => {
      acc = acc ? `${acc}/${seg}` : seg;
      let child = node.children.find((c) => c.segment === seg);
      if (!child) {
        child = { segment: seg, path: acc, children: [] };
        node.children.push(child);
      }
      if (i === segments.length - 1) child.page = page;
      node = child;
    });
  }
  return root.children;
}
function StructureTree({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  return (
    <ul className={cn(depth > 0 && "pl-4 border-l border-gray-100 ml-1")}>
      {nodes.map((node) => (
        <li key={node.path} className="space-y-1.5">
          <div className="text-xs text-gray-400 font-mono">{node.segment}</div>
          {node.page && (
            <div className="ml-5 bg-white border border-gray-100 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-gray-900">{node.page.h1}</p>
              {node.page.headings.length > 0 && (
                <ul className="text-xs text-gray-500 space-y-0.5 pl-3">
                  {node.page.headings.map((h, i) => (
                    <li key={i} className="border-l border-gray-200 pl-2">{h}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-gray-400">{node.page.navLabel}</span>
                {node.page.keywords.map((k, i) => (
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">{k}</span>
                ))}
              </div>
            </div>
          )}
          {node.children.length > 0 && <StructureTree nodes={node.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

export default function KeywordsView({ projectId }: { projectId: string }) {
  const [studies, setStudies] = useState<StudyListItem[]>([]);
  const [current, setCurrent] = useState<Study | null>(null);
  const [loadingStudies, setLoadingStudies] = useState(true);

  // Nuevo estudio
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Subir CSV/documento con keywords ya investigadas (con volumen y,
  // opcionalmente, competencia/CPC/intención) — crea el estudio directamente
  // con esos datos, sin llamar a DataForSEO.
  const [importingFile, setImportingFile] = useState(false);
  const [importFileError, setImportFileError] = useState("");

  // Sugerencias
  const [seed, setSeed] = useState("");
  const [limit, setLimit] = useState(30);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggError, setSuggError] = useState("");

  // Pegar lista
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [resolving, setResolving] = useState(false);

  // Estructura
  const [generatingStructure, setGeneratingStructure] = useState(false);
  const [structureError, setStructureError] = useState("");

  // Edición / borrado del estudio (desde la lista)
  const [listEditId, setListEditId] = useState<string | null>(null);
  const [listEditName, setListEditName] = useState("");
  const [listEditNotes, setListEditNotes] = useState("");
  const [listSaving, setListSaving] = useState(false);

  // Edición / borrado del estudio (desde dentro del workspace)
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLocation, setEditLocation] = useState<LocationValue>(null);
  const [savingStudy, setSavingStudy] = useState(false);
  const [deletingStudy, setDeletingStudy] = useState(false);

  function loadStudies() {
    return fetch(`/api/proyectos/${projectId}/keywords/estudios`)
      .then((r) => r.json())
      .then((d: StudyListItem[]) => Array.isArray(d) && setStudies(d));
  }

  function openStudy(studyId: string) {
    fetch(`/api/proyectos/${projectId}/keywords/estudios/${studyId}`)
      .then((r) => r.json())
      .then((d: Study | { error: string }) => {
        if (d && !("error" in d)) setCurrent(d);
      });
  }

  function reloadCurrent() {
    if (current) openStudy(current.id);
    loadStudies();
  }

  function startListEdit(study: StudyListItem) {
    setListEditId(study.id);
    setListEditName(study.name);
    setListEditNotes(study.notes ?? "");
  }

  async function handleListSave() {
    if (!listEditId) return;
    setListSaving(true);
    await fetch(`/api/proyectos/${projectId}/keywords/estudios/${listEditId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: listEditName.trim(), notes: listEditNotes.trim() || null }),
    });
    setListSaving(false);
    setListEditId(null);
    loadStudies();
  }

  async function handleListDelete(studyId: string, studyName: string) {
    if (!confirm(`¿Eliminar el estudio "${studyName}" y todas sus keywords?`)) return;
    await fetch(`/api/proyectos/${projectId}/keywords/estudios/${studyId}`, { method: "DELETE" });
    loadStudies();
  }

  function startEdit() {
    if (!current) return;
    setEditName(current.name);
    setEditNotes(current.notes ?? "");
    // Cargamos la ubicación actual del estudio en el picker. Como el estudio
    // solo guarda el locationCode (no el nombre), lo resolvemos desde el
    // mismo JSON estático que usa el LocationPicker.
    setEditLocation(
      current.locationCode && current.locationCode !== 2724
        ? { code: current.locationCode, name: resolveLocationName(current.locationCode) ?? `Código ${current.locationCode}` }
        : null
    );
    setEditing(true);
  }

  async function handleSaveStudy() {
    if (!current) return;
    setSavingStudy(true);
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim() ? editName : current.name,
        notes: editNotes.trim() ? editNotes : null,
        locationCode: editLocation?.code ?? 2724,
      }),
    });
    const data = await res.json();
    setSavingStudy(false);
    if (!res.ok) return;
    setCurrent(data);
    setEditing(false);
    loadStudies();
  }

  async function handleDeleteStudy() {
    if (!current) return;
    if (!window.confirm(`¿Eliminar el estudio '${current.name}' y todas sus keywords?`)) return;
    setDeletingStudy(true);
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios/${current.id}`, {
      method: "DELETE",
    });
    setDeletingStudy(false);
    if (!res.ok) return;
    setCurrent(null);
    setEditing(false);
    loadStudies();
  }

  useEffect(() => {
    loadStudies().finally(() => setLoadingStudies(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreateStudy(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName || undefined }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) return;
    setNewName("");
    setCurrent(data);
    loadStudies();
  }

  async function handleImportFile(file: File) {
    setImportFileError("");
    setImportingFile(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios/importar-archivo`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    setImportingFile(false);
    if (!res.ok) {
      setImportFileError(data.error ?? "Error al importar el archivo");
      return;
    }
    setCurrent(data);
    loadStudies();
  }

  async function handleSearch() {
    setSuggError("");
    if (!seed.trim()) return;
    setSearching(true);
    setSuggestions([]);
    const res = await fetch(
      `/api/proyectos/${projectId}/keywords/estudios/${current!.id}/sugerencias?seed=${encodeURIComponent(seed.trim())}&limit=${limit}`
    );
    const data = await res.json();
    setSearching(false);
    if (!res.ok) {
      setSuggError(data.error ?? "Error al buscar sugerencias");
      return;
    }
    setSuggestions(data.items ?? []);
  }

  async function addItems(items: Suggestion[]) {
    if (items.length === 0) return;
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios/${current!.id}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (res.ok) {
      reloadCurrent();
      // Quita de la lista de sugerencias las ya añadidas.
      const added = new Set(items.map((i) => i.keyword));
      setSuggestions((prev) => prev.filter((s) => !added.has(s.keyword)));
    }
  }

  async function handleResolve() {
    setSuggError("");
    setResolving(true);
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios/${current!.id}/keywords/resolver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: pasteText }),
    });
    const data = await res.json();
    setResolving(false);
    if (!res.ok) {
      setSuggError(data.error ?? "Error al resolver la lista");
      return;
    }
    setPasteText("");
    reloadCurrent();
  }

  async function handleRemove(keywordId: string) {
    await fetch(`/api/proyectos/${projectId}/keywords/estudios/${current!.id}/keywords/${keywordId}`, {
      method: "DELETE",
    });
    reloadCurrent();
  }

  function exportCsv() {
    if (!current) return;
    downloadCsv(
      `keywords-${current.name}-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Keyword", "Volumen", "Competición", "CPC", "Intención", "Prioridad"],
      current.keywords.map((kw) => [kw.keyword, kw.searchVolume ?? "", kw.competition ?? "", kw.cpc ?? "", kw.intent ?? "", kw.priority])
    );
  }

  async function handleGenerateStructure() {
    setStructureError("");
    setGeneratingStructure(true);
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios/${current!.id}/estructura`, {
      method: "POST",
    });
    const data = await res.json();
    setGeneratingStructure(false);
    if (!res.ok) {
      setStructureError(data.error ?? "Error al generar la estructura");
      return;
    }
    setCurrent((prev) => (prev ? { ...prev, structure: data.structure, structureModel: data.structureModel, updatedAt: data.updatedAt } : prev));
    loadStudies();
  }

  const tree = current?.structure?.pages ? buildTree(current.structure.pages) : [];
  const inStudy = new Set(current?.keywords.map((k) => k.keyword) ?? []);

  // ===== Vista del workspace (estudio abierto) =====
  if (current) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setCurrent(null)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a estudios
        </button>

        <div>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{current.name}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {current.keywords.length} keywords · {current.languageCode.toUpperCase()}/{current.locationCode} · {new Date(current.createdAt).toLocaleDateString("es-ES")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={startEdit}
                disabled={deletingStudy}
                className="p-1.5 text-gray-400 hover:text-gray-900 disabled:opacity-50"
                title="Editar estudio"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={handleDeleteStudy}
                disabled={deletingStudy}
                className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50"
                title="Eliminar estudio"
              >
                {deletingStudy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {current.notes && !editing && (
            <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{current.notes}</p>
          )}
        </div>

        {/* Panel inline de edición del estudio */}
        {editing && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Nombre del estudio</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={120}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Notas</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Notas internas sobre este estudio (opcional)..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Ubicación de la búsqueda</label>
              <div className="max-w-sm">
                <LocationPicker value={editLocation} onChange={setEditLocation} />
              </div>
              <p className="text-xs text-gray-400">
                Cambiarla aquí NO recalcula en bloque las keywords ya cacheadas, pero el siguiente
                “Lanzar / re-procesar análisis” propagará la nueva ubicación al Rank Tracking
                (reemplazando las keywords viejas sin histórico).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveStudy}
                disabled={savingStudy}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {savingStudy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Guardar
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={savingStudy}
                className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Buscar keywords relacionadas (Planificador) */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Buscar keywords relacionadas</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="block text-xs text-gray-500">Keyword semilla</label>
              <input
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="abogado de familia"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-gray-500">Nº resultados</label>
              <div className="flex gap-1">
                {LIMITS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLimit(n)}
                    className={cn(
                      "px-2.5 py-2 rounded-lg text-xs font-medium border",
                      limit === n ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Coste estimado de la búsqueda: ~${suggestionsCostUsd(limit).toFixed(2)} (las que añadas después son gratis, ya cacheadas).
          </p>

          {suggError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{suggError}</p>}

          {suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{suggestions.length} sugerencias</p>
                <button
                  onClick={() => addItems(suggestions)}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" /> Añadir todas
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-sm">
                  <tbody>
                    {suggestions.map((s) => {
                      const already = inStudy.has(s.keyword);
                      return (
                        <tr key={s.keyword} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 px-3 text-gray-900">{s.keyword}</td>
                          <td className="py-2 px-2 text-gray-600 tabular-nums w-20">
                            {s.searchVolume === null ? <span className="text-gray-300">—</span> : s.searchVolume.toLocaleString("es-ES")}
                          </td>
                          <td className="py-2 px-2 w-16">
                            <span className={cn("text-xs font-medium", COMPETITION_STYLES[s.competition ?? ""] ?? "text-gray-400")}>
                              {s.competition ?? "—"}
                            </span>
                          </td>
                          <td className="py-2 px-2 w-20 text-gray-600 tabular-nums">{fmtCpc(s.cpc)}</td>
                          <td className="py-2 px-2 w-28">
                            {s.intent && (
                              <span className={cn("text-[11px] px-2 py-0.5 rounded-full", INTENT_STYLES[s.intent] ?? "bg-gray-100 text-gray-500")}>
                                {s.intent}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 w-12 text-right">
                            <button
                              onClick={() => addItems([s])}
                              disabled={already}
                              className="p-1 text-gray-400 hover:text-gray-900 disabled:text-emerald-500 disabled:cursor-default"
                              title={already ? "Ya en el estudio" : "Añadir al estudio"}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pegar lista (alternativa) */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <button
            onClick={() => setShowPaste((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-gray-700"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", showPaste && "rotate-180")} />
            O pegar una lista de keywords
          </button>
          {showPaste && (
            <div className="space-y-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                placeholder={"una keyword por línea"}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 font-mono"
              />
              <button
                onClick={handleResolve}
                disabled={resolving || !pasteText.trim()}
                className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Añadir al estudio
              </button>
            </div>
          )}
        </div>

        {/* Tabla de keywords del estudio */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Keywords del estudio ({current.keywords.length})</h3>
            <button
              onClick={exportCsv}
              disabled={current.keywords.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
              title="Exportar a CSV"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>

          {current.keywords.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay keywords. Busca relacionadas o pega una lista para empezar.</p>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="font-medium py-2 px-2">Keyword</th>
                    <th className="font-medium py-2 px-2">Volumen</th>
                    <th className="font-medium py-2 px-2">Comp.</th>
                    <th className="font-medium py-2 px-2">CPC</th>
                    <th className="font-medium py-2 px-2">Intención</th>
                    <th className="font-medium py-2 px-2 text-right">Prio.</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {current.keywords.map((kw) => (
                    <tr key={kw.id} className="border-b border-gray-50">
                      <td className="py-2 px-2 text-gray-900">{kw.keyword}</td>
                      <td className="py-2 px-2 text-gray-700 tabular-nums">
                        {kw.searchVolume === null ? <span className="text-gray-300">—</span> : kw.searchVolume.toLocaleString("es-ES")}
                      </td>
                      <td className="py-2 px-2">
                        <span className={cn("text-xs font-medium", COMPETITION_STYLES[kw.competition ?? ""] ?? "text-gray-400")}>
                          {kw.competition ?? "—"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-600 tabular-nums">{fmtCpc(kw.cpc)}</td>
                      <td className="py-2 px-2">
                        {kw.intent ? (
                          <span className={cn("text-[11px] px-2 py-0.5 rounded-full", INTENT_STYLES[kw.intent] ?? "bg-gray-100 text-gray-500")}>
                            {kw.intent}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-700 tabular-nums">{kw.priority}</td>
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => handleRemove(kw.id)}
                          className="p-1 text-gray-300 hover:text-red-600"
                          title="Quitar del estudio"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Estructura de URLs — sección propia, no un botón secundario perdido
            en la tabla: es el resultado final del módulo, sobre el que luego
            trabajan Título/Meta y Contenido. */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Estructura de URLs</h3>
              <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                Propone, vía IA, un árbol de páginas (slug, H1, encabezados) a partir de las
                keywords de este estudio — listo como brief para Contenido y Título/Meta.
              </p>
            </div>
            <button
              onClick={handleGenerateStructure}
              disabled={generatingStructure || current.keywords.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 shrink-0"
            >
              {generatingStructure ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {current.structure ? "Regenerar estructura" : "Generar estructura de URLs"}
            </button>
          </div>

          {current.keywords.length === 0 && (
            <p className="text-xs text-gray-400">Añade al menos una keyword al estudio para poder generarla.</p>
          )}
          {structureError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{structureError}</p>
          )}

          {tree.length > 0 ? (
            <div className="pt-2">
              <p className="text-xs text-gray-400 mb-3">
                Generada con {current.structureModel} · {new Date(current.updatedAt).toLocaleString("es-ES")}
              </p>
              <StructureTree nodes={tree} depth={0} />
            </div>
          ) : (
            current.keywords.length > 0 &&
            !generatingStructure && (
              <p className="text-sm text-gray-500">
                Aún no se ha generado. Pulsa &laquo;Generar estructura de URLs&raquo;.
              </p>
            )
          )}
        </div>
      </div>
    );
  }

  // ===== Vista de listado de estudios =====
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Keyword Research</h2>
        <p className="text-sm text-gray-500 mt-1">
          Estudios de palabras clave por proyecto. Cada estudio es un espacio de trabajo: busca
          relacionadas, añade las que interesan y construye el árbol de URLs.
        </p>
      </div>

      <form onSubmit={handleCreateStudy} className="bg-white rounded-xl border border-gray-100 p-5 flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <label className="block text-sm font-medium text-gray-700">Nuevo estudio</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Briefing Q3 — Cliente X"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear
        </button>
      </form>

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-medium text-gray-700">O sube un CSV con keywords ya investigadas</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Columnas: keyword (obligatoria) y, si las tienes, volumen / competencia / cpc / intención.
              También acepta la exportación tal cual de Google Ads Keyword Planner (&laquo;Historial de
              estadísticas de palabras clave&raquo;). Se usan tal cual vengan en el archivo — no se
              completan con DataForSEO.
            </p>
          </div>
          <label
            className={cn(
              "flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 cursor-pointer shrink-0",
              importingFile && "opacity-50 pointer-events-none"
            )}
          >
            {importingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Subir archivo
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // permite volver a subir el mismo archivo si falla
                if (file) handleImportFile(file);
              }}
            />
          </label>
        </div>
        {importFileError && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{importFileError}</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Estudios</h3>
        {loadingStudies ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : studies.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no hay estudios para este proyecto.</p>
        ) : (
          <div className="space-y-2">
            {studies.map((s) => (
              <div key={s.id} className="bg-white rounded-lg border border-gray-100 p-3">
                {listEditId === s.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={listEditName}
                      onChange={(e) => setListEditName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
                      placeholder="Nombre del estudio"
                    />
                    <textarea
                      value={listEditNotes}
                      onChange={(e) => setListEditNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
                      placeholder="Notas o descripción breve (opcional)..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleListSave}
                        disabled={listSaving}
                        className="px-3 py-1 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 disabled:opacity-50"
                      >
                        {listSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Guardar"}
                      </button>
                      <button
                        onClick={() => setListEditId(null)}
                        className="px-3 py-1 text-xs text-gray-500 hover:text-gray-900"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => openStudy(s.id)}
                        className="text-sm text-gray-900 hover:underline text-left flex-1 min-w-0 truncate"
                      >
                        {s.name}
                      </button>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); startListEdit(s); }}
                          className="p-1 text-gray-300 hover:text-gray-900"
                          title="Editar nombre y notas"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleListDelete(s.id, s.name); }}
                          className="p-1 text-gray-300 hover:text-red-600"
                          title="Eliminar estudio"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {s.notes && (
                      <p className="text-xs text-gray-500 mt-0.5 leading-snug">{s.notes}</p>
                    )}
                    <button
                      onClick={() => openStudy(s.id)}
                      className="text-xs text-gray-400 hover:text-gray-600 mt-0.5 block"
                    >
                      {s._count.keywords} keywords{s.hasStructure ? " · estructura" : ""} · {s.languageCode.toUpperCase()}/{s.locationCode} · {new Date(s.createdAt).toLocaleDateString("es-ES")}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
