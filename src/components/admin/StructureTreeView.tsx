"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Globe, Hash, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StructureTreeNode } from "@/lib/keywords/structure-tree";

// Árbol vertical colapsable que muestra la arquitectura de URLs completa de un
// estudio: etiqueta de menú, H1, URL, encabezados (H2/H3) y keywords de cada
// página. Sustituye al abanico horizontal de tarjetas de ancho fijo (w-64) que
// cortaba las frases con truncate y ocultaba headings y keywords. Aquí nada se
// trunca: los textos largos hacen salto de línea y el panel crece hacia abajo.

function fmtVolume(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function cleanDomain(domain: string | null): string | null {
  if (!domain) return null;
  return domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function NodeCard({ node, domain }: { node: StructureTreeNode; domain: string | null }) {
  const page = node.page;
  const fullUrl = page && domain ? `https://${domain}/${page.slug}` : null;

  return (
    <div className="flex-1 min-w-0 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">
          {page ? page.navLabel : node.segment || "Carpeta"}
        </span>
        {node.volume > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 tabular-nums">
            <Search className="h-2.5 w-2.5" /> {fmtVolume(node.volume)} vol.
          </span>
        )}
        {node.children.length > 0 && (
          <span className="text-[10px] text-gray-400">
            {node.children.length} sub{node.children.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {page ? (
        <p className="text-sm font-semibold text-gray-900 break-words">{page.h1}</p>
      ) : (
        <p className="text-sm font-semibold text-gray-700 break-words">{node.segment}</p>
      )}

      {fullUrl && <p className="text-[11px] text-gray-400 break-all">{fullUrl}</p>}

      {page && page.headings.length > 0 && (
        <ul className="space-y-0.5">
          {page.headings.map((h, i) => (
            <li key={i} className="flex items-start gap-1 text-xs text-gray-600">
              <Hash className="h-3 w-3 text-gray-300 shrink-0 mt-0.5" />
              <span className="break-words">{h}</span>
            </li>
          ))}
        </ul>
      )}

      {page && page.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {page.keywords.map((kw, i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 break-words"
            >
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TreeBranch({
  node,
  domain,
  depth,
}: {
  node: StructureTreeNode;
  domain: string | null;
  depth: number;
}) {
  const hasChildren = node.children.length > 0;
  // Nivel 0 y 1 abiertos por defecto; a partir de ahí, colapsados para no
  // inundar la vista con todo el árbol de golpe.
  const [open, setOpen] = useState(depth < 1);

  return (
    <li className="relative">
      <div className="flex items-start gap-2">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-0.5 mt-0.5 text-gray-400 hover:text-gray-900 shrink-0 rounded hover:bg-gray-100"
            aria-label={open ? "Contraer" : "Expandir"}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <NodeCard node={node} domain={domain} />
      </div>

      {hasChildren && open && (
        <ul className="relative ml-[9px] border-l border-gray-200 pl-4 space-y-3 mt-2">
          {node.children.map((child) => (
            <TreeBranch key={child.path} node={child} domain={domain} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function StructureTreeView({
  root,
  domain,
}: {
  root: StructureTreeNode;
  domain: string | null;
}) {
  const site = cleanDomain(domain);
  return (
    <div className={cn("space-y-3")}>
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Globe className="h-4 w-4 text-gray-400" />
        Inicio{site ? <span className="text-gray-400 font-normal"> — {site}</span> : null}
      </div>
      <ul className="relative ml-[7px] border-l border-gray-200 pl-4 space-y-3">
        {root.children.map((child) => (
          <TreeBranch key={child.path} node={child} domain={site} depth={0} />
        ))}
      </ul>
    </div>
  );
}
