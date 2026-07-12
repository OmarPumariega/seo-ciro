"use client";

import { useState } from "react";
import {
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  FileSearch,
  CheckCircle2,
  XCircle,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import LocationPicker, { type LocationValue } from "@/components/admin/LocationPicker";

type TfidfTerm = {
  term: string;
  tfidf: number;
  docs: number;
};

type AnalyzeResponse = {
  terms: TfidfTerm[];
  sources: string[];
  costUsd: number | null;
};

export default function TfidfView({ projectId }: { projectId: string }) {
  const [keyword, setKeyword] = useState("");
  const [languageCode, setLanguageCode] = useState("es");
  const [location, setLocation] = useState<LocationValue>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  // Texto del propio contenido para comparar qué términos recomendados faltan.
  const [myContent, setMyContent] = useState("");
  const [checkContent, setCheckContent] = useState(false);

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
  }

  // Normalización para el cotejo de términos (mismo criterio que el backend).
  function normalize(s: string): string {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ");
  }

  const normalizedContent = checkContent ? normalize(myContent) : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">TF-IDF / Prominencia semántica</h2>
        <p className="text-sm text-gray-500 mt-1">
          Scrapea el top-10 de Google para una keyword y descubre qué términos comparten las páginas
          que ya posicionan. Son los que debería incluir tu contenido para competir.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-100 p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Keyword</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ej. reformas cocina valencia"
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Ubicación <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <LocationPicker value={location} onChange={setLocation} />
          </div>
        </div>
        <p className="text-xs text-gray-400 -mt-2">
          El top-10 orgánico se busca simulando la búsqueda desde ese punto — clave si el negocio es
          local. Sin elegir nada, se usa España (nacional).
        </p>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Opciones avanzadas
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600">
                  Idioma (código)
                </label>
                <input
                  type="text"
                  value={languageCode}
                  onChange={(e) => setLanguageCode(e.target.value)}
                  placeholder="es"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
                />
              </div>
              <p className="col-span-2 text-xs text-gray-400">
                Default: es (español).
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            Coste estimado: ~0,002 $ (1 llamada SERP depth 10 + scraping gratuito)
          </p>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Analizar
          </button>
        </div>
      </form>

      {result && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Términos recomendados ({result.terms.length})
                </h3>
              </div>
              <button
                onClick={() =>
                  downloadCsv(
                    `tfidf-${keyword}-${new Date().toISOString().slice(0, 10)}.csv`,
                    ["Término", "TF-IDF", "Nº docs"],
                    result.terms.map((t) => [t.term, t.tfidf.toFixed(4), t.docs])
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
                title="Exportar a CSV"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Top-20 por score TF-IDF sobre el corpus de {result.sources.length} páginas. Incluye
              unigramas y bigramas.{" "}
              {result.costUsd !== null && (
                <>Coste real: {result.costUsd.toFixed(4)} $.</>
              )}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="py-2 pr-4 font-medium">Término</th>
                    <th className="py-2 pr-4 font-medium">TF-IDF</th>
                    <th className="py-2 font-medium">Nº docs</th>
                    {checkContent && <th className="py-2 font-medium text-right">Tu contenido</th>}
                  </tr>
                </thead>
                <tbody>
                  {result.terms.map((t) => {
                    const present = checkContent && normalizedContent.includes(normalize(t.term));
                    return (
                      <tr key={t.term} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pr-4 text-gray-900 font-medium">{t.term}</td>
                        <td className="py-2 pr-4 text-gray-600 font-mono text-xs">{t.tfidf}</td>
                        <td className="py-2 text-gray-600">{t.docs}</td>
                        {checkContent && (
                          <td className="py-2 text-right">
                            {present ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Presente
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                                <XCircle className="h-3.5 w-3.5" />
                                Falta
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Comparador de contenido propio */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={checkContent}
                onChange={(e) => setCheckContent(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
              />
              Comparar con mi contenido
            </label>
            <p className="text-xs text-gray-400">
              Pega tu borrador para marcar cuáles de los términos recomendados faltan en tu texto.
            </p>
            {checkContent && (
              <textarea
                value={myContent}
                onChange={(e) => setMyContent(e.target.value)}
                rows={6}
                placeholder="Pega aquí el texto de tu contenido..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 resize-y"
              />
            )}
          </div>

          {/* Fuentes (corpus real) */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Corpus analizado ({result.sources.length} páginas)
            </h3>
            {result.sources.length === 0 ? (
              <p className="text-sm text-gray-500">
                No se pudo scrapear ninguna página del top-10 (puede que requieran JavaScript o
                bloqueen el acceso).
              </p>
            ) : (
              <ul className="space-y-1">
                {result.sources.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "text-sm text-blue-600 hover:underline truncate block"
                      )}
                    >
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
