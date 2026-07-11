"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Sparkles,
  ChevronDown,
  Network,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  keywords: Keyword[];
  structure: { pages: StructurePage[] } | null;
  structureModel: string | null;
};

type StudyListItem = {
  id: string;
  name: string;
  languageCode: string;
  locationCode: number;
  createdAt: string;
  updatedAt: string;
  hasStructure: boolean;
  _count: { keywords: number };
};

// Intención → pastilla de color. Reutiliza el vocabulario de 3 colores del
// resto de la app (gris/ámbar/esmeralda de SchemaView/AuditoriaView) en vez
// de introducir colores nuevos.
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

function fmtCpc(v: number | string | null): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? `${n.toFixed(2)}€` : "—";
}

// Construye un árbol a partir de slugs con subcarpetas (ej.
// "servicios/abogado-de-familia") para renderizar la jerarquía sin librería
// de diagramas: simplemente agrupando por segmentos de ruta.
type TreeNode = {
  segment: string;
  path: string;
  page?: StructurePage;
  children: TreeNode[];
};

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
          <div className="flex items-center gap-1.5 text-sm">
            {node.page ? (
              <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            ) : (
              <Network className="h-3.5 w-3.5 text-gray-300 shrink-0" />
            )}
            <span className={cn(node.page ? "text-gray-400 font-mono text-xs" : "text-gray-400 font-medium text-xs uppercase tracking-wide")}>
              {node.segment}
            </span>
          </div>
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
                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
          {node.children.length > 0 && (
            <StructureTree nodes={node.children} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

export default function KeywordsView({ projectId }: { projectId: string }) {
  const [keywordText, setKeywordText] = useState("");
  const [studyName, setStudyName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [languageCode, setLanguageCode] = useState("es");
  const [locationCode, setLocationCode] = useState(2724);

  const [loading, setLoading] = useState(false);
  const [generatingStructure, setGeneratingStructure] = useState(false);
  const [error, setError] = useState("");

  const [current, setCurrent] = useState<Study | null>(null);
  const [history, setHistory] = useState<StudyListItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/keywords/estudios`)
      .then((r) => r.json())
      .then((data: StudyListItem[]) => {
        if (Array.isArray(data)) setHistory(data);
        setLoadingHistory(false);
      });
  }, [projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setCurrent(null);

    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: studyName || undefined,
        keywords: keywordText,
        languageCode,
        locationCode,
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Error al crear el estudio");
      return;
    }

    setCurrent(data);
    // Recarga el historial para incluir el nuevo estudio con su _count.
    fetch(`/api/proyectos/${projectId}/keywords/estudios`)
      .then((r) => r.json())
      .then((d: StudyListItem[]) => Array.isArray(d) && setHistory(d));
  }

  async function loadDetail(studyId: string) {
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios/${studyId}`);
    if (res.ok) setCurrent(await res.json());
  }

  async function handleGenerateStructure() {
    if (!current) return;
    setError("");
    setGeneratingStructure(true);

    const res = await fetch(
      `/api/proyectos/${projectId}/keywords/estudios/${current.id}/estructura`,
      { method: "POST" }
    );
    const data = await res.json();
    setGeneratingStructure(false);

    if (!res.ok) {
      setError(data.error ?? "Error al generar la estructura");
      return;
    }

    setCurrent((prev) =>
      prev
        ? {
            ...prev,
            structure: data.structure,
            structureModel: data.structureModel,
            updatedAt: data.updatedAt,
          }
        : prev
    );
    setHistory((prev) =>
      prev.map((h) => (h.id === current.id ? { ...h, hasStructure: true, updatedAt: data.updatedAt } : h))
    );
  }

  const tree = current?.structure?.pages ? buildTree(current.structure.pages) : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Keyword Research</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pega una lista de keywords para resolver volumen, intención y prioridad reales contra
          DataForSEO, y genera después la estructura de URLs del sitio.
        </p>
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Nombre del estudio <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={studyName}
            onChange={(e) => setStudyName(e.target.value)}
            placeholder="Briefing Q3 — Negocio cliente"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Keywords <span className="text-gray-400 font-normal">(una por línea)</span>
          </label>
          <textarea
            value={keywordText}
            onChange={(e) => setKeywordText(e.target.value)}
            rows={8}
            placeholder={"abogado de familia madrid\ndivorcio express\nseparación de bienes"}
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 font-mono"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")} />
          Opciones avanzadas
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Idioma (código)</label>
              <input
                type="text"
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                maxLength={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Ubicación (código)</label>
              <input
                type="number"
                value={locationCode}
                onChange={(e) => setLocationCode(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              />
            </div>
            <p className="col-span-2 text-xs text-gray-400">
              Por defecto España (es / 2724). No se valida contra las tablas de DataForSEO: un valor
              inválido saldrá como un error claro de la API.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Resolver datos
        </button>
      </form>

      {current && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{current.name}</p>
              <p className="text-xs text-gray-400">
                {current.keywords.length} keywords · {current.languageCode.toUpperCase()} /{" "}
                {current.locationCode} · {new Date(current.createdAt).toLocaleString("es-ES")}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="font-medium py-2 px-2">Keyword</th>
                  <th className="font-medium py-2 px-2">Volumen</th>
                  <th className="font-medium py-2 px-2">Comp.</th>
                  <th className="font-medium py-2 px-2">CPC</th>
                  <th className="font-medium py-2 px-2">Intención</th>
                  <th className="font-medium py-2 px-2 text-right">Prioridad</th>
                </tr>
              </thead>
              <tbody>
                {current.keywords.map((kw) => (
                  <tr key={kw.id} className="border-b border-gray-50">
                    <td className="py-2 px-2 text-gray-900">{kw.keyword}</td>
                    <td className="py-2 px-2 text-gray-700">
                      {kw.searchVolume === null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        kw.searchVolume.toLocaleString("es-ES")
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {kw.competition ? (
                        <span className={cn("text-xs font-medium", COMPETITION_STYLES[kw.competition] ?? "text-gray-500")}>
                          {kw.competition}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-gray-600">{fmtCpc(kw.cpc)}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Estructura de URLs</h3>
                <p className="text-xs text-gray-400">
                  {current.structure
                    ? `Generada con ${current.structureModel} · ${new Date(current.updatedAt).toLocaleString("es-ES")}`
                    : "Aún no generada"}
                </p>
              </div>
              <button
                onClick={handleGenerateStructure}
                disabled={generatingStructure}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {generatingStructure ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {current.structure ? "Regenerar" : "Generar estructura"}
              </button>
            </div>

            {tree.length > 0 && <StructureTree nodes={tree} depth={0} />}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Historial de estudios</h3>
        {loadingHistory ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no hay estudios para este proyecto.</p>
        ) : (
          <div className="space-y-2">
            {history.map((study) => (
              <button
                key={study.id}
                onClick={() => loadDetail(study.id)}
                className={cn(
                  "w-full text-left bg-white rounded-lg border p-3 hover:bg-gray-50 transition-colors",
                  current?.id === study.id ? "border-gray-900" : "border-gray-100"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900 truncate">{study.name}</p>
                  <span className="text-xs text-gray-400 shrink-0 ml-2">
                    {study._count.keywords} keywords{study.hasStructure ? " · estructura" : ""}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{new Date(study.createdAt).toLocaleString("es-ES")}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
