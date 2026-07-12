"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import locations from "@/lib/rank/locations-es.json";

// Selector de ubicación real para simular la búsqueda desde un punto concreto
// (comunidad autónoma, provincia, ciudad o municipio) en vez del país entero.
// Los códigos vienen de una foto real de `GET /v3/serp/google/locations/ES`
// (DataForSEO, coste 0) — nunca inventados. Se sirven como JSON estático
// porque la lista apenas cambia y así el filtrado es instantáneo en cliente,
// sin gastar una llamada a la API en cada tecla.

type LocationOption = { code: number; name: string; type: string };
const ALL = locations as LocationOption[];

const TYPE_ORDER: Record<string, number> = {
  City: 0,
  Municipality: 1,
  Province: 2,
  "Autonomous Community": 3,
};

const TYPE_LABEL: Record<string, string> = {
  City: "Ciudad",
  Municipality: "Municipio",
  Province: "Provincia",
  "Autonomous Community": "Comunidad autónoma",
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export type LocationValue = { code: number; name: string } | null;

export default function LocationPicker({
  value,
  onChange,
  placeholder = "España (nacional) — busca una comunidad, provincia, ciudad o municipio",
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const results = useMemo(() => {
    const q = stripAccents(query.trim().toLowerCase());
    if (!q) return [];
    const starts: LocationOption[] = [];
    const includes: LocationOption[] = [];
    for (const loc of ALL) {
      const name = stripAccents(loc.name.toLowerCase());
      if (name.startsWith(q)) starts.push(loc);
      else if (name.includes(q)) includes.push(loc);
      if (starts.length >= 8) break;
    }
    const rank = (a: LocationOption) => TYPE_ORDER[a.type] ?? 9;
    return [...starts, ...includes]
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [query]);

  return (
    <div ref={boxRef} className="relative">
      {value ? (
        <div className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50">
          <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span className="text-gray-900 truncate flex-1">{value.name}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="text-gray-400 hover:text-gray-700 shrink-0"
            title="Quitar ubicación — volver a España (nacional)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
        />
      )}

      {open && !value && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {results.map((loc) => (
            <button
              key={loc.code}
              type="button"
              onClick={() => {
                onChange({ code: loc.code, name: loc.name });
                setQuery("");
                setOpen(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
            >
              <span className="text-gray-900 truncate">{loc.name}</span>
              <span className="text-[10px] text-gray-400 shrink-0">{TYPE_LABEL[loc.type] ?? loc.type}</span>
            </button>
          ))}
        </div>
      )}
      {open && !value && query.trim() && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs text-gray-400">
          Sin coincidencias en España.
        </div>
      )}
    </div>
  );
}
