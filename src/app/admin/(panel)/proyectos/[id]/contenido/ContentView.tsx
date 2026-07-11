"use client";

import { useEffect, useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Loader2, Copy, Check, Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
  wordCount: number;
  createdAt: string;
};

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
  const [copied, setCopied] = useState(false);

  const [history, setHistory] = useState<Generation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/contenido`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setHistory(data);
        setLoadingHistory(false);
      });
  }, [projectId]);

  function handleTypeChange(next: ContentType) {
    setType(next);
    setTargetWords(DEFAULT_TARGET_WORDS[next]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setCurrent(null);

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
    setHistory((prev) => [data, ...prev]);
  }

  function copyContent() {
    if (!current) return;
    navigator.clipboard.writeText(current.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
            <span className="text-xs text-gray-400 uppercase tracking-wide">
              {current.wordCount} palabras
            </span>
            <button onClick={copyContent} className="text-gray-400 hover:text-gray-900" aria-label="Copiar contenido">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{current.content}</pre>
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
