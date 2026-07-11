"use client";

import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Search, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectInfo = { id: string; name: string; isLocalBusiness: boolean };

const RECENTS_KEY = "seoCiro:recentProjects";
const RECENTS_MAX = 5;

// Recientes en localStorage (cliente): los últimos proyectos visitados, para
// acceder rápido sin buscar. No viaja al servidor.
export function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function pushRecent(id: string) {
  if (typeof window === "undefined") return;
  const prev = readRecents().filter((x) => x !== id);
  localStorage.setItem(RECENTS_KEY, JSON.stringify([id, ...prev].slice(0, RECENTS_MAX)));
}

export default function ProjectSwitcher({
  projects,
  currentId,
  onSelect,
}: {
  projects: ProjectInfo[];
  currentId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);

  // Carga recientes al abrir (localStorage puede haber cambiado en otra pestaña).
  // Diferido a microtask para no llamar setState de forma síncrona en el effect.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setRecents(readRecents());
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const current = projects.find((p) => p.id === currentId) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : [];

  const recentProjects = recents
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is ProjectInfo => !!p)
    .filter((p) => (q ? p.name.toLowerCase().includes(q) : true));

  function pick(id: string) {
    onSelect(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="px-3">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white hover:bg-gray-50 outline-none focus:border-gray-400"
            disabled={projects.length === 0}
          >
            <span className="truncate text-left">
              {current ? current.name : currentId ? "Cargando…" : "Selecciona proyecto"}
            </span>
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col max-h-80 w-[var(--radix-popover-trigger-width)]"
          >
            {/* Buscador arriba */}
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50">
                <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar proyecto…"
                  className="bg-transparent text-sm outline-none flex-1 min-w-0"
                />
              </div>
            </div>

            <div className="overflow-y-auto py-1">
              {/* Recientes (últimos 5 visitados) — solo si hay y no se filtra */}
              {recentProjects.length > 0 && (
                <>
                  <p className="flex items-center gap-1 px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400">
                    <Clock className="h-3 w-3" /> Recientes
                  </p>
                  {recentProjects.map((p) => (
                    <Row key={p.id} name={p.name} active={p.id === currentId} onClick={() => pick(p.id)} />
                  ))}
                  {!q && <div className="my-1 border-t border-gray-100" />}
                </>
              )}

              {/* Todos (o filtrados por búsqueda) */}
              {!q && <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400">Todos</p>}
              {(q ? filtered : projects.filter((p) => !recentProjects.includes(p))).map((p) => (
                <Row key={p.id} name={p.name} active={p.id === currentId} onClick={() => pick(p.id)} />
              ))}
              {(q ? filtered : projects).length === 0 && (
                <p className="px-3 py-3 text-sm text-gray-400">
                  {projects.length === 0 ? "Cargando proyectos…" : "Sin resultados."}
                </p>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function Row({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50",
        active ? "text-gray-900 font-medium" : "text-gray-600"
      )}
    >
      <span className="truncate">{name}</span>
      {active && <Check className="h-3.5 w-3.5 text-gray-900 shrink-0" />}
    </button>
  );
}
