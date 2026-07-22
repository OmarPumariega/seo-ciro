"use client";

import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown, Loader2, FileBarChart2, RotateCcw } from "lucide-react";
import {
  type SectionKey,
  type ReportSections,
  SECTION_KEYS,
  SECTION_LABELS,
} from "@/lib/informe/sections";

type ApiResponse = {
  sections: ReportSections;
  order: SectionKey[];
  isCustom?: boolean;
};

// Tarjeta de configuración GLOBAL del informe (en /admin/configuracion).
// Define el default de secciones activadas + orden para TODOS los proyectos.
// Cada proyecto puede luego tener su propio override desde su InformeBuilder.
// Patrón clonado de InformeBuilder.tsx (mismos checkboxes + flechas ↑/↓).
export default function InformeGlobalConfigCard() {
  const [sections, setSections] = useState<ReportSections>(() =>
    SECTION_KEYS.reduce((acc, k) => {
      acc[k] = true;
      return acc;
    }, {} as ReportSections)
  );
  const [order, setOrder] = useState<SectionKey[]>([...SECTION_KEYS]);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/configuracion/informe")
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        if (d && d.sections && d.order) {
          setSections(d.sections);
          setOrder(d.order);
          setIsCustom(!!d.isCustom);
        }
      })
      .catch(() => setError("No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: SectionKey) {
    setSections((c) => ({ ...c, [key]: !c[key] }));
    setSaved(false);
  }
  function move(key: SectionKey, dir: -1 | 1) {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/configuracion/informe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections, order }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Error al guardar");
        return;
      }
      setSaved(true);
      setIsCustom(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm("¿Restablecer la configuración global al default? Los proyectos con override propio no se ven afectados.")) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/configuracion/informe", { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Error al restablecer");
        return;
      }
      // Recargar valores default
      const fresh = await fetch("/api/configuracion/informe").then((r) => r.json());
      if (fresh && fresh.sections && fresh.order) {
        setSections(fresh.sections);
        setOrder(fresh.order);
        setIsCustom(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
          <FileBarChart2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Informe — configuración por defecto</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Define qué secciones aparecen y en qué orden para TODOS los proyectos por defecto. Cada
            proyecto puede tener su propio override desde su módulo Informe.
            {!isCustom && loading === false && (
              <span className="text-gray-400"> Actualmente usando el default del sistema.</span>
            )}
            {isCustom && <span className="text-emerald-600"> Actualmente personalizada.</span>}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </div>
      ) : (
        <>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
          <p className="text-xs text-gray-500">Activa o desactiva cada sección y reordénala con las flechas ↑ ↓.</p>
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {order.map((key, i) => (
              <li
                key={key}
                className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-2 py-1.5"
              >
                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={sections[key]}
                    onChange={() => toggle(key)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                  />
                  <span className="text-gray-700 truncate">{SECTION_LABELS[key]}</span>
                </label>
                <button
                  type="button"
                  onClick={() => move(key, -1)}
                  disabled={i === 0}
                  className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Subir"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(key, 1)}
                  disabled={i === order.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Bajar"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={reset}
              disabled={saving || !isCustom}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!isCustom ? "Ya estás en el default" : "Restablecer al default"}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restablecer al default
            </button>
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs text-emerald-600">Guardado</span>}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Guardar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
