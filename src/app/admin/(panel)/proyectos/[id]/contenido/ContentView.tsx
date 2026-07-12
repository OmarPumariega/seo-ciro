"use client";

import { useEffect, useMemo, useState } from "react";
import * as Select from "@radix-ui/react-select";
import {
  Loader2,
  Copy,
  Check,
  Sparkles,
  ChevronDown,
  GitCompare,
  History,
  RotateCcw,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { lineDiff } from "@/lib/seo/diff";
import {
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  DEFAULT_TARGET_WORDS,
  type ContentType,
} from "@/lib/seo/content";

type Generation = {
  id: string;
  type: ContentType;
  topic: string;
  keyword: string | null;
  targetUrl: string | null;
  content: string;
  internalLinks: string | null;
  wordCount: number;
  model: string;
  createdAt: string;
};

type Group = { topic: string; versions: Generation[] };

// --- Helpers para sugerencias de enlaces internos ---
// El grafo de la auditoría guarda URLs completas; la estructura de keywords
// guarda slugs relativos que hay que combinar con el dominio del proyecto.
function urlToPathname(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    const path = u.pathname;
    return path === "/" ? "/" : path.replace(/\/+$/, "");
  } catch {
    return fullUrl;
  }
}

function buildFullUrl(domain: string, slug: string): string {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const path = slug.replace(/^\/+/, "").replace(/\/+$/, "");
  return path ? `https://${host}/${path}` : `https://${host}/`;
}

// Mismo filtrado defensivo que `parseLinkGraph` en /api/.../enlaces: descarta
// entradas malformadas del JSON sin romper el resto.
function extractUrlsFromGraph(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const urls: string[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { url?: unknown }).url === "string"
    ) {
      urls.push((entry as { url: string }).url);
    }
  }
  return urls;
}

type ProjectUrl = { full: string; short: string };

export default function ContentView({ projectId }: { projectId: string }) {
  const [type, setType] = useState<ContentType>("blog");
  const [topic, setTopic] = useState("");
  const [keyword, setKeyword] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [internalLinks, setInternalLinks] = useState("");
  const [targetWords, setTargetWords] = useState(DEFAULT_TARGET_WORDS.blog);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<Generation | null>(null);
  const [restored, setRestored] = useState(false);
  const [copied, setCopied] = useState(false);

  const [history, setHistory] = useState<Generation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // URLs conocidas del proyecto (auditoría + estructura de keywords) para
  // sugerirlas como enlaces internos con un clic.
  const [projectUrls, setProjectUrls] = useState<ProjectUrl[]>([]);
  const [loadingUrls, setLoadingUrls] = useState(true);

  // Versión contra la que se compara la actual (null = sin modo comparación).
  const [compareTarget, setCompareTarget] = useState<Generation | null>(null);

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/contenido`)
      .then((r) => r.json())
      .then((data) => {
        // El GET ahora devuelve { recent, groups }. Se mantiene tolerante a
        // un array plano por si la forma cambiase.
        if (Array.isArray(data)) {
          setHistory(data);
        } else if (data && typeof data === "object") {
          if (Array.isArray(data.recent)) setHistory(data.recent);
          if (Array.isArray(data.groups)) setGroups(data.groups);
        }
        setLoadingHistory(false);
      });
  }, [projectId]);

  // Carga las URLs del sitio desde la última auditoría con grafo de enlaces
  // y, como complemento, las páginas propuestas en la estructura de keywords
  // del estudio más reciente que la tenga. Prioridad: auditoría (URLs reales
  // rastreadas) sobre estructura (slugs propuestos, no garantiza que existan).
  useEffect(() => {
    let cancelled = false;
    async function loadProjectUrls() {
      setLoadingUrls(true);
      try {
        const [auditRes, studiesRes, projectRes] = await Promise.all([
          fetch(`/api/proyectos/${projectId}/auditorias`).then((r) => r.json()),
          fetch(`/api/proyectos/${projectId}/keywords/estudios`).then((r) => r.json()),
          fetch(`/api/proyectos/${projectId}`).then((r) => r.json()),
        ]);
        if (cancelled) return;

        const urls: ProjectUrl[] = [];
        const seen = new Set<string>();
        const addUnique = (full: string) => {
          if (seen.has(full)) return;
          seen.add(full);
          urls.push({ full, short: urlToPathname(full) });
        };

        // 1) Auditoría completada más reciente con linkGraph no nulo.
        const runs: Array<{ status: string; linkGraph: unknown }> = Array.isArray(auditRes)
          ? auditRes
          : [];
        const latestWithGraph = runs.find((r) => r.status === "completed" && r.linkGraph);
        if (latestWithGraph) {
          for (const u of extractUrlsFromGraph(latestWithGraph.linkGraph)) addUnique(u);
        }

        // 2) Estructura de keywords (slugs → URL completa con el dominio).
        const domain: string | null =
          projectRes && typeof projectRes.domain === "string" ? projectRes.domain : null;
        const studies: Array<{ id: string; hasStructure: boolean }> = Array.isArray(studiesRes)
          ? studiesRes
          : [];
        const withStructure = studies.find((s) => s.hasStructure);
        if (withStructure && domain) {
          const detail = await fetch(
            `/api/proyectos/${projectId}/keywords/estudios/${withStructure.id}`
          ).then((r) => r.json());
          if (!cancelled) {
            const pages: Array<{ slug?: unknown }> =
              detail?.structure?.pages && Array.isArray(detail.structure.pages)
                ? detail.structure.pages
                : [];
            for (const p of pages) {
              if (typeof p.slug === "string" && p.slug.trim()) {
                addUnique(buildFullUrl(domain, p.slug));
              }
            }
          }
        }

        if (!cancelled) setProjectUrls(urls.slice(0, 20));
      } catch {
        if (!cancelled) setProjectUrls([]);
      } finally {
        if (!cancelled) setLoadingUrls(false);
      }
    }
    loadProjectUrls();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // URLs ya presentes en el textarea (para marcar chips como añadidos).
  const addedUrls = useMemo(
    () => new Set(internalLinks.split("\n").map((l) => l.trim()).filter(Boolean)),
    [internalLinks]
  );

  function addInternalLink(url: string) {
    setInternalLinks((prev) => {
      const lines = prev.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.includes(url)) return prev;
      return lines.length === 0 ? url : `${lines.join("\n")}\n${url}`;
    });
  }

  // Resto de versiones del mismo tema que la generación actual (excluida).
  // Se prefiere `groups` (tra todas) y se cae a `history` si no hubiera grupo.
  const otherVersions = useMemo<Generation[]>(() => {
    if (!current) return [];
    const group = groups.find((g) => g.topic === current.topic);
    if (group) return group.versions.filter((v) => v.id !== current.id);
    return history.filter((v) => v.topic === current.topic && v.id !== current.id);
  }, [current, groups, history]);

  // Diff línea a línea entre la versión actual y la de comparación.
  const diff = useMemo(() => {
    if (!current || !compareTarget) return null;
    return lineDiff(current.content, compareTarget.content);
  }, [current, compareTarget]);

  function handleTypeChange(next: ContentType) {
    setType(next);
    setTargetWords(DEFAULT_TARGET_WORDS[next]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setCurrent(null);
    setCompareTarget(null);
    setRestored(false);

    const res = await fetch(`/api/proyectos/${projectId}/contenido`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        topic,
        keyword: keyword || undefined,
        targetUrl: targetUrl || undefined,
        internalLinks: internalLinks || undefined,
        targetWords,
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Error al generar el contenido");
      return;
    }

    setCurrent(data);
    setRestored(false);
    setHistory((prev) => [data, ...prev]);
    setGroups((prev) => {
      const idx = prev.findIndex((g) => g.topic === data.topic);
      if (idx === -1) return [{ topic: data.topic, versions: [data] }, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], versions: [data, ...next[idx].versions] };
      return next;
    });
  }

  function copyContent() {
    if (!current) return;
    navigator.clipboard.writeText(current.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Rellena el formulario con los metadatos de la generación actual para que
  // el usuario vuelva a generar y cree otra versión del mismo tema.
  function handleRegenerate() {
    if (!current) return;
    setType(current.type);
    setTopic(current.topic);
    setKeyword(current.keyword ?? "");
    setTargetUrl(current.targetUrl ?? "");
    setCompareTarget(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Promociona una versión como "actual" para copiarla/usarla. No borra nada.
  function handleRestore(gen: Generation) {
    setCurrent(gen);
    setRestored(true);
    setCompareTarget(null);
    setCopied(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Generador de Contenido</h2>
        <p className="text-sm text-gray-500 mt-1">
          Genera un texto completo con jerarquía de encabezados, usando el tono de marca
          del proyecto.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Tipo de contenido</label>
            <Select.Root value={type} onValueChange={(v) => handleTypeChange(v as ContentType)}>
              <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
                <Select.Value />
                <Select.Icon>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                  <Select.Viewport>
                    {CONTENT_TYPES.map((value) => (
                      <Select.Item
                        key={value}
                        value={value}
                        className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"
                      >
                        <Select.ItemText>{CONTENT_TYPE_LABELS[value]}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Palabras objetivo</label>
            <input
              type="number"
              min={20}
              value={targetWords}
              onChange={(e) => setTargetWords(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Tema</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Cómo elegir un buen abogado de familia en Madrid"
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Keyword objetivo <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              URL destino <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Enlaces internos a incluir <span className="text-gray-400 font-normal">(opcional, uno por línea)</span>
          </label>
          <textarea
            value={internalLinks}
            onChange={(e) => setInternalLinks(e.target.value)}
            rows={2}
            placeholder={"https://www.ejemplo.com/servicios\nhttps://www.ejemplo.com/contacto"}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              URLs del proyecto
            </span>
            {projectUrls.length > 0 && (
              <span className="text-[11px] text-gray-400">Clic para añadir como enlace interno</span>
            )}
          </div>
          {loadingUrls ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
          ) : projectUrls.length === 0 ? (
            <p className="text-xs text-gray-400">
              Ejecuta una auditoría para ver las URLs del sitio y sugerir enlaces.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {projectUrls.map((u) => {
                const already = addedUrls.has(u.full);
                return (
                  <button
                    key={u.full}
                    type="button"
                    onClick={() => addInternalLink(u.full)}
                    disabled={already}
                    title={u.full}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors",
                      already
                        ? "bg-emerald-50 text-emerald-600 cursor-default"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer"
                    )}
                  >
                    {u.short}
                    {already && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generar
        </button>
      </form>

      {current && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                {current.wordCount} palabras
              </span>
              {restored && (
                <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Versión restaurada
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleRegenerate}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-600 hover:bg-gray-100"
                title="Rellenar el formulario con este tema para generar otra versión"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Regenerar
              </button>
              <button
                onClick={copyContent}
                className="text-gray-400 hover:text-gray-900 p-1"
                aria-label="Copiar contenido"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{current.content}</pre>
        </div>
      )}

      {/* Comparación línea a línea contra otra versión del mismo tema */}
      {current && compareTarget && diff && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <GitCompare className="h-4 w-4" />
                Comparación de versiones
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Actual ({current.wordCount} palabras) frente a la del{" "}
                {new Date(compareTarget.createdAt).toLocaleString("es-ES")} ({compareTarget.wordCount} palabras)
              </p>
            </div>
            <button
              onClick={() => setCompareTarget(null)}
              className="text-gray-400 hover:text-gray-900 p-1"
              aria-label="Cerrar comparación"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="rounded-lg border border-gray-100 overflow-hidden font-mono text-xs">
            {diff.map((line, idx) => (
              <div
                key={idx}
                className={cn(
                  "px-3 py-0.5 whitespace-pre-wrap break-words",
                  line.type === "added" && "bg-emerald-50 text-emerald-700",
                  line.type === "removed" && "bg-red-50 text-red-700",
                  line.type === "same" && "text-gray-400"
                )}
              >
                <span className="select-none inline-block w-4 shrink-0">
                  {line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}
                </span>
                {line.text || "\u00A0"}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-emerald-50 border border-emerald-200" /> Añadida
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-red-50 border border-red-200" /> Quitada
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-white border border-gray-200" /> Sin cambios
            </span>
          </div>
        </div>
      )}

      {/* Otras versiones del mismo tema */}
      {current && otherVersions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Otras versiones de este tema</h3>
            <span className="text-xs text-gray-400">{otherVersions.length} más</span>
          </div>
          <div className="space-y-2">
            {otherVersions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{v.topic}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(v.createdAt).toLocaleString("es-ES")} · {v.wordCount} palabras · {v.model}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setCompareTarget(v)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-md text-xs",
                      compareTarget?.id === v.id
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <GitCompare className="h-3.5 w-3.5" /> Comparar
                  </button>
                  <button
                    onClick={() => handleRestore(v)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-600 hover:bg-gray-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Historial del proyecto</h3>
        {loadingHistory ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no se ha generado nada para este proyecto.</p>
        ) : (
          <div className="space-y-2">
            {history.map((gen) => (
              <button
                key={gen.id}
                onClick={() => {
                  setCurrent(gen);
                  setRestored(false);
                  setCompareTarget(null);
                }}
                className={cn(
                  "w-full text-left bg-white rounded-lg border p-3 hover:bg-gray-50 transition-colors",
                  current?.id === gen.id ? "border-gray-900" : "border-gray-100"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900 truncate">{gen.topic}</p>
                  <span className="text-xs text-gray-400 shrink-0 ml-2">
                    {CONTENT_TYPE_LABELS[gen.type]} · {gen.wordCount} palabras
                  </span>
                </div>
                <p className="text-xs text-gray-400">{new Date(gen.createdAt).toLocaleString("es-ES")}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
