"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, Search, ChevronDown, ChevronUp, FileSearch,
  CheckCircle2, XCircle, ClipboardCopy, Check, Clock, List, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import LocationPicker, { type LocationValue } from "@/components/admin/LocationPicker";

type TfidfTerm = { term: string; tfidf: number; docs: number };
type TopicGap = { text: string; coverage: number; urls: string[] };
type HeadingByPage = { url: string; headings: string[] };
type HeadingTerm = { term: string; count: number };
// Top-10 orgánico tal cual lo devuelve Google para la keyword. El snippet
// (description) es "cómo está posicionando la competencia hoy" — ejemplo de
// copy accionable que llega gratis con el SERP que ya pagamos.
type CompetitorSerp = {
  url: string;
  title: string;
  position: number | null;
  description: string | null;
};

type FullResult = {
  terms: TfidfTerm[];
  topics: TopicGap[];
  headingsByPage: HeadingByPage[];
  headingTerms: HeadingTerm[];
  sources: string[];
  competitors?: CompetitorSerp[];
  costUsd?: number | null;
};

type StoredResult = {
  id: string;
  keyword: string;
  result: FullResult;
  updatedAt: string;
};

export default function TfidfView({ projectId }: { projectId: string }) {
  const [keyword, setKeyword] = useState("");
  const [languageCode, setLanguageCode] = useState("es");
  const [location, setLocation] = useState<LocationValue>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FullResult | null>(null);

  const [stored, setStored] = useState<StoredResult[]>([]);
  const [loadingStored, setLoadingStored] = useState(true);

  const [myContent, setMyContent] = useState("");
  const [checkContent, setCheckContent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [expandedPage, setExpandedPage] = useState<string | null>(null);

  const loadStored = useCallback(() => {
    fetch(`/api/proyectos/${projectId}/tfidf`)
      .then((r) => r.json())
      .then((d: StoredResult[]) => {
        if (Array.isArray(d)) {
          setStored(d);
          if (d.length > 0 && !result) {
            setResult(d[0].result);
            setKeyword(d[0].keyword);
          }
        }
      })
      .finally(() => setLoadingStored(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    loadStored();
  }, [loadStored]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setResult(null);

    const res = await fetch(`/api/proyectos/${projectId}/tfidf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword,
        languageCode: languageCode || undefined,
        locationCode: location?.code,
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Error al analizar la keyword");
      return;
    }
    setResult(data);
    loadStored();
  }

  function selectStored(s: StoredResult) {
    setResult(s.result);
    setKeyword(s.keyword);
    setError("");
  }

  function normalize(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ");
  }
  const normalizedContent = checkContent ? normalize(myContent) : "";
  const totalSources = result?.sources.length ?? 0;

  function copyTopics() {
    if (!result) return;
    const text = result.topics.slice(0, 15).map((t) => t.text).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const maxHeadingTermCount = result?.headingTerms[0]?.count ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">TF-IDF / Cobertura de temas</h2>
        <p className="text-sm text-gray-500 mt-1">
          Analiza el top-10 de Google para una keyword y descubre qué temas (H2/H3) y términos
          comparten las páginas que ya posicionan. Los resultados se generan automáticamente al
          chequear keywords en Rank Tracking.
        </p>
      </div>

      {/* Resultados disponibles (auto-generados desde Rank Tracking) */}
      {loadingStored && stored.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando resultados guardados…
        </div>
      )}
      {stored.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Resultados disponibles ({stored.length})</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stored.map((s) => (
              <button
                key={s.id}
                onClick={() => selectStored(s)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                  result === s.result
                    ? "bg-gray-900 text-white border-gray-900"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
                title={new Date(s.updatedAt).toLocaleDateString("es-ES")}
              >
                {s.keyword}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Formulario de análisis manual */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Keyword</label>
            <input
              type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)}
              placeholder="ej. reformas cocina valencia" required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Ubicación <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <LocationPicker value={location} onChange={setLocation} />
          </div>
        </div>
        <div>
          <button type="button" onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900">
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Opciones avanzadas
          </button>
          {showAdvanced && (
            <input type="text" value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}
              placeholder="es" className="mt-2 w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand" />
          )}
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            Coste: ~0,002 $ (gratis si rank tracking ya consultó esa keyword).
          </p>
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Analizar
          </button>
        </div>
      </form>

      {/* Resultados */}
      {result && (
        <div className="space-y-4">
          {/* Cómo lo muestran los competidores en Google (top-10 con snippet).
              El snippet es el dato de copy más accionable: cómo vende Google a
              quienes ya posicionan. Llega gratis con el SERP que paga el
              rank tracking / este análisis. */}
          {result.competitors && result.competitors.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Search className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Cómo lo muestran tus competidores en Google (top-10)
                </h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                El título y el snippet con el que Google muestra a cada resultado — tu mejor referencia de copy para titulo/meta.
              </p>
              <ol className="space-y-2">
                {result.competitors.map((c, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="shrink-0 mt-0.5 h-5 w-5 rounded bg-gray-100 text-gray-500 text-[11px] font-semibold inline-flex items-center justify-center tabular-nums">
                      {c.position ?? i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={c.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-indigo-700 hover:underline font-medium inline-flex items-start gap-1"
                      >
                        <span className="truncate">{c.title || c.url}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 mt-1 text-gray-400" />
                      </a>
                      {c.description && (
                        <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{c.description}</p>
                      )}
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        {(() => {
                          try {
                            return new URL(c.url).hostname.replace(/^www\./, "");
                          } catch {
                            return c.url;
                          }
                        })()}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Temas del top-10 (H2/H3 con cobertura) */}
          {result.topics.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Temas del top-10 ({result.topics.length})</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={copyTopics}
                    className="flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                    {copied ? "Copiado" : "Copiar temas"}
                  </button>
                  <Link href={`/admin/proyectos/${projectId}/contenido`}
                    className="px-2.5 py-1 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800">
                    Ir a Contenido →
                  </Link>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Encabezados H2/H3 de {totalSources} páginas. {result.costUsd != null && <>Coste: {result.costUsd.toFixed(4)} $.</>}
              </p>
              <ul className="space-y-1.5">
                {result.topics.slice(0, 40).map((t, i) => {
                  const pct = totalSources > 0 ? Math.round((t.coverage / totalSources) * 100) : 0;
                  const present = checkContent && normalizedContent.includes(normalize(t.text.toLowerCase()));
                  return (
                    <li key={i} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-2 min-w-0">
                        {checkContent && (present
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          : <XCircle className="h-4 w-4 text-amber-500 shrink-0" />)}
                        <span className="text-sm text-gray-900 truncate">{t.text}</span>
                      </div>
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums shrink-0",
                        pct >= 60 ? "bg-emerald-50 text-emerald-700" : pct >= 30 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500")}>
                        {t.coverage}/{totalSources}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Palabras más frecuentes en encabezados */}
          {result.headingTerms.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <List className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Palabras frecuentes en encabezados</h3>
              </div>
              <div className="space-y-1.5">
                {result.headingTerms.slice(0, 20).map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 w-32 truncate">{t.term}</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-brand rounded" style={{ width: `${(t.count / maxHeadingTermCount) * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-400 tabular-nums w-6 text-right">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Encabezados completos por página */}
          {result.headingsByPage.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Encabezados por página del top-10</h3>
              <div className="space-y-1.5">
                {result.headingsByPage.map((p, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedPage(expandedPage === p.url ? null : p.url)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <span className="text-gray-700 truncate flex-1 text-left">{p.url}</span>
                      <span className="text-xs text-gray-400 shrink-0">{p.headings.length} H2/H3</span>
                      {expandedPage === p.url
                        ? <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        : <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                    </button>
                    {expandedPage === p.url && (
                      <ul className="px-4 py-2 space-y-1 bg-gray-50">
                        {p.headings.map((h, j) => (
                          <li key={j} className="text-sm text-gray-600">• {h}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comparador de contenido */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={checkContent} onChange={(e) => setCheckContent(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400" />
              Comparar con mi contenido
            </label>
            <p className="text-xs text-gray-400">Pega tu borrador para marcar qué temas faltan en tu texto.</p>
            {checkContent && (
              <textarea value={myContent} onChange={(e) => setMyContent(e.target.value)} rows={5}
                placeholder="Pega aquí el texto de tu contenido..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand resize-y" />
            )}
          </div>

          {/* Términos TF-IDF (colapsable) */}
          {result.terms.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <button onClick={() => setShowTerms((v) => !v)}
                className="flex items-center gap-1 text-sm font-semibold text-gray-900">
                {showTerms ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Términos relevantes (TF-IDF) — {result.terms.length}
              </button>
              {showTerms && (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                      <th className="py-2 pr-4 font-medium">Término</th>
                      <th className="py-2 pr-4 font-medium">TF-IDF</th>
                      <th className="py-2 font-medium">Nº docs</th>
                    </tr></thead>
                    <tbody>
                      {result.terms.map((t) => (
                        <tr key={t.term} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-4 text-gray-900 font-medium">{t.term}</td>
                          <td className="py-2 pr-4 text-gray-500 font-mono text-xs">{t.tfidf}</td>
                          <td className="py-2 text-gray-500">{t.docs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Corpus */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Corpus ({result.sources.length} páginas)</h3>
            {result.sources.length === 0 ? (
              <p className="text-sm text-gray-500">No se pudo scrapear ninguna página.</p>
            ) : (
              <ul className="space-y-1">
                {result.sources.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate block">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
