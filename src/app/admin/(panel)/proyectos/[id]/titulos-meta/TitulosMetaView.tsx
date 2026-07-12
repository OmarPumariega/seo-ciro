"use client";

import { useEffect, useState } from "react";
import { Loader2, Copy, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import UrlLink from "@/components/admin/UrlLink";

type Variant = { title: string; description: string };

type Generation = {
  id: string;
  url: string;
  keyword: string | null;
  variants: Variant[];
  model: string;
  createdAt: string;
};

const TITLE_MAX = 65;
const DESC_MIN = 70;
const DESC_MAX = 155;

function charCountClass(count: number, max: number, min = 0) {
  if (count > max) return "text-red-600";
  if (count < min) return "text-amber-600";
  return "text-emerald-600";
}

function VariantCard({ variant, index }: { variant: Variant; index: number }) {
  const [copiedField, setCopiedField] = useState<"title" | "description" | null>(null);

  function copy(field: "title" | "description", text: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        Variante {index + 1}
      </p>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Título</span>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-mono", charCountClass(variant.title.length, TITLE_MAX))}>
              {variant.title.length}/{TITLE_MAX}
            </span>
            <button
              onClick={() => copy("title", variant.title)}
              className="text-gray-400 hover:text-gray-900"
              aria-label="Copiar título"
            >
              {copiedField === "title" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-900">{variant.title}</p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Descripción</span>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs font-mono",
                charCountClass(variant.description.length, DESC_MAX, DESC_MIN)
              )}
            >
              {variant.description.length}/{DESC_MAX}
            </span>
            <button
              onClick={() => copy("description", variant.description)}
              className="text-gray-400 hover:text-gray-900"
              aria-label="Copiar descripción"
            >
              {copiedField === "description" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-600">{variant.description}</p>
      </div>
    </div>
  );
}

export default function TitulosMetaView({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<Generation | null>(null);
  const [history, setHistory] = useState<Generation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/titulos-meta`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setHistory(data);
        setLoadingHistory(false);
      });
  }, [projectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setCurrent(null);

    const res = await fetch(`/api/proyectos/${projectId}/titulos-meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, keyword: keyword || undefined }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Error al generar los títulos y meta descripciones");
      return;
    }

    setCurrent(data);
    setHistory((prev) => [data, ...prev]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Título y Meta Descripción</h2>
        <p className="text-sm text-gray-500 mt-1">
          Analiza una URL real del proyecto y genera 3 variantes de título y meta descripción
          siguiendo las reglas SEO de la agencia.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.ejemplo.com/pagina"
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Keyword objetivo <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Se detecta automáticamente si se deja en blanco"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {current.variants.map((variant, i) => (
            <VariantCard key={i} variant={variant} index={i} />
          ))}
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
              <div
                key={gen.id}
                role="button"
                tabIndex={0}
                onClick={() => setCurrent(gen)}
                onKeyDown={(e) => e.key === "Enter" && setCurrent(gen)}
                className={cn(
                  "w-full text-left bg-white rounded-lg border p-3 hover:bg-gray-50 transition-colors cursor-pointer",
                  current?.id === gen.id ? "border-gray-900" : "border-gray-100"
                )}
              >
                <UrlLink url={gen.url} className="text-sm" />
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(gen.createdAt).toLocaleString("es-ES")}
                  {gen.keyword ? ` · ${gen.keyword}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
