"use client";

import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_LABELS, type ReportSections, type SectionKey } from "@/lib/informe/sections";

// Checklist + reorder de secciones del Informe — compartido entre el
// InformeBuilder de cada proyecto y la configuración global
// (InformeGlobalConfigCard), antes duplicado como el mismo código dos veces.
// Las activadas se agrupan siempre arriba (bloque "Activadas") y las
// desactivadas debajo, para verlas de un vistazo sin tener que recorrer toda
// la lista — subir/bajar mueve solo DENTRO del propio grupo (nunca salta por
// encima de una sección del otro grupo, aunque en `order` sean adyacentes).
export default function SectionOrderList({
  order,
  enabledMap,
  onToggle,
  onReorder,
  variant = "plain",
}: {
  order: SectionKey[];
  enabledMap: ReportSections;
  onToggle: (key: SectionKey) => void;
  onReorder: (next: SectionKey[]) => void;
  variant?: "plain" | "boxed";
}) {
  const enabled = order.filter((k) => enabledMap[k]);
  const disabled = order.filter((k) => !enabledMap[k]);

  function moveWithinGroup(key: SectionKey, dir: -1 | 1) {
    const group = enabledMap[key] ? enabled : disabled;
    const pos = group.indexOf(key);
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= group.length) return;
    const neighbor = group[targetPos];

    // Saca `key` de `order` y la reinserta justo al lado de su vecina dentro
    // del mismo grupo — el resto de `order` (incluido el otro grupo) no se
    // toca, así sigue siendo una permutación completa válida.
    const withoutKey = order.filter((k) => k !== key);
    const neighborIdx = withoutKey.indexOf(neighbor);
    const insertAt = dir === -1 ? neighborIdx : neighborIdx + 1;
    const next = [...withoutKey.slice(0, insertAt), key, ...withoutKey.slice(insertAt)];
    onReorder(next);
  }

  function Group({ title, keys }: { title: string; keys: SectionKey[] }) {
    if (keys.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-1">
          {title} ({keys.length})
        </p>
        <ul className="space-y-1">
          {keys.map((key, i) => (
            <li
              key={key}
              className={cn(
                "flex items-center gap-2 text-sm",
                variant === "boxed" && "bg-gray-50 rounded-lg px-2 py-1.5"
              )}
            >
              <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={enabledMap[key]}
                  onChange={() => onToggle(key)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                />
                <span className="text-gray-700 truncate">{SECTION_LABELS[key]}</span>
              </label>
              <button
                type="button"
                onClick={() => moveWithinGroup(key, -1)}
                disabled={i === 0}
                className="p-1 text-gray-300 hover:text-gray-900 disabled:opacity-30"
                title="Subir"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveWithinGroup(key, 1)}
                disabled={i === keys.length - 1}
                className="p-1 text-gray-300 hover:text-gray-900 disabled:opacity-30"
                title="Bajar"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-72 overflow-y-auto">
      <Group title="Activadas" keys={enabled} />
      <Group title="Desactivadas" keys={disabled} />
    </div>
  );
}
