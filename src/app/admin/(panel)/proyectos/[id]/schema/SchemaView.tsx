"use client";

import { useEffect, useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Loader2, Copy, Check, Sparkles, ChevronDown, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SCHEMA_TYPE_LABELS: Record<string, string> = {
  LocalBusiness: "LocalBusiness (negocio local)",
  Article: "Article (artículo/blog)",
  FAQPage: "FAQPage (preguntas frecuentes)",
};

type Generation = {
  id: string;
  url: string;
  suggestedType: string;
  selectedType: string;
  jsonLd: Record<string, unknown>;
  valid: boolean;
  validationErrors: string[] | null;
  createdAt: string;
};

export default function SchemaView({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [suggestedType, setSuggestedType] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>("Article");
  const [current, setCurrent] = useState<Generation | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<Generation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/schema`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setHistory(data);
        setLoadingHistory(false);
      });
  }, [projectId]);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCurrent(null);
    setSuggestedType(null);
    setAnalyzing(true);

    const res = await fetch(`/api/proyectos/${projectId}/schema/sugerencia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    setAnalyzing(false);

    if (!res.ok) {
      setError(data.error ?? "Error al analizar la URL");
      return;
    }

    setSuggestedType(data.suggestedType);
    setSelectedType(data.suggestedType);
  }

  async function handleGenerate() {
    setError("");
    setGenerating(true);

    const res = await fetch(`/api/proyectos/${projectId}/schema`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, type: selectedType }),
    });
    const data = await res.json();
    setGenerating(false);

    if (!res.ok) {
      setError(data.error ?? "Error al generar el schema");
      return;
    }

    setCurrent(data);
    setHistory((prev) => [data, ...prev]);
  }

  function copyJsonLd() {
    if (!current) return;
    navigator.clipboard.writeText(JSON.stringify(current.jsonLd, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Generador de Schema</h2>
        <p className="text-sm text-gray-500 mt-1">
          Analiza una URL, confirma el tipo de datos estructurados y genera el JSON-LD.
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setSuggestedType(null);
              setCurrent(null);
            }}
            placeholder="https://www.ejemplo.com/pagina"
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>

        <button
          type="submit"
          disabled={analyzing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Analizar
        </button>

        {suggestedType && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Tipo de schema{" "}
                <span className="text-gray-400 font-normal">
                  (sugerido: {SCHEMA_TYPE_LABELS[suggestedType] ?? suggestedType})
                </span>
              </label>
              <Select.Root value={selectedType} onValueChange={setSelectedType}>
                <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
                  <Select.Value />
                  <Select.Icon>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                    <Select.Viewport>
                      {Object.entries(SCHEMA_TYPE_LABELS).map(([value, label]) => (
                        <Select.Item
                          key={value}
                          value={value}
                          className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100"
                        >
                          <Select.ItemText>{label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {generating && <Loader2 className="h-4 w-4 animate-spin" />}
              Generar JSON-LD
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      </form>

      {current && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div
            className={cn(
              "flex items-center gap-2 text-sm px-3 py-2 rounded-lg",
              current.valid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            )}
          >
            {current.valid ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {current.valid ? "Válido" : "Con avisos de validación"}
          </div>
          {!current.valid && current.validationErrors && (
            <ul className="text-sm text-red-600 list-disc list-inside">
              {current.validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 uppercase tracking-wide">JSON-LD</span>
            <button onClick={copyJsonLd} className="text-gray-400 hover:text-gray-900" aria-label="Copiar JSON-LD">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(current.jsonLd, null, 2)}
          </pre>
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
                onClick={() => setCurrent(gen)}
                className={cn(
                  "w-full text-left bg-white rounded-lg border p-3 hover:bg-gray-50 transition-colors",
                  current?.id === gen.id ? "border-gray-900" : "border-gray-100"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-900 truncate">{gen.url}</p>
                  <span className="text-xs text-gray-400 shrink-0 ml-2">
                    {SCHEMA_TYPE_LABELS[gen.selectedType] ?? gen.selectedType}
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
