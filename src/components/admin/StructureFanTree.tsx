"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, FileText, Folder, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import UrlLink from "@/components/admin/UrlLink";
import type { StructureTreeNode } from "@/lib/keywords/structure-tree";

// Árbol en abanico (horizontal, expandible rama a rama) del módulo
// Arquitectura: a diferencia de una lista indentada, cada nivel fluye hacia
// la derecha al expandir, con líneas de conexión tipo organigrama — se pide
// explícitamente que "al hacer clic en las ramas se desplieguen más páginas
// con su URL", no una lista plana.

function fmtVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

function NodeCard({
  node,
  domain,
  isRoot,
  open,
  hasChildren,
  onToggle,
}: {
  node: StructureTreeNode;
  domain: string | null;
  isRoot: boolean;
  open: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}) {
  const fullUrl = domain ? `https://${domain}/${node.path}` : null;
  const label = isRoot ? "Inicio" : node.page?.navLabel || node.segment;

  return (
    <div
      className={cn(
        "bg-white rounded-lg border p-3 w-64 shrink-0",
        isRoot ? "border-gray-900" : "border-gray-200"
      )}
    >
      <div className="flex items-start gap-2">
        {hasChildren ? (
          <button
            onClick={onToggle}
            className="p-0.5 mt-0.5 text-gray-400 hover:text-gray-900 shrink-0"
            aria-label={open ? "Colapsar rama" : "Expandir rama"}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="mt-0.5 shrink-0">
            {node.page ? (
              <FileText className="h-4 w-4 text-gray-300" />
            ) : (
              <Folder className="h-4 w-4 text-gray-300" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate" title={label}>
            {label}
          </p>
          {node.page && (
            <p className="text-xs text-gray-500 truncate mt-0.5" title={node.page.h1}>
              {node.page.h1}
            </p>
          )}
          {fullUrl && node.page ? (
            <UrlLink url={fullUrl} className="text-[11px] mt-1" />
          ) : (
            !isRoot && <p className="text-[11px] text-gray-400 mt-1 truncate">/{node.path}/*</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
            {node.volume > 0 && (
              <span className="flex items-center gap-0.5 tabular-nums">
                <Search className="h-2.5 w-2.5" /> {fmtVolume(node.volume)} vol.
              </span>
            )}
            {node.page && node.page.keywords.length > 0 && (
              <span>{node.page.keywords.length} keyword{node.page.keywords.length === 1 ? "" : "s"}</span>
            )}
            {hasChildren && <span>{node.children.length} rama{node.children.length === 1 ? "" : "s"}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function FanBranch({
  node,
  domain,
  isRoot = false,
  depth = 0,
}: {
  node: StructureTreeNode;
  domain: string | null;
  isRoot?: boolean;
  depth?: number;
}) {
  // Home y primer nivel abiertos por defecto; más abajo, colapsado (un
  // estudio real puede tener decenas de páginas).
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex items-center">
      <NodeCard
        node={node}
        domain={domain}
        isRoot={isRoot}
        open={open}
        hasChildren={hasChildren}
        onToggle={() => setOpen((v) => !v)}
      />
      {hasChildren && open && (
        <ul className="flex flex-col">
          {node.children.map((child, i) => (
            <li key={child.path} className="relative pl-8">
              {/* Elbow de conexión: tramo vertical desde/hacia los hermanos +
                  tramo horizontal hasta la tarjeta hija — mismo patrón que un
                  árbol de archivos. */}
              <span
                className="absolute left-4 top-0 w-px bg-gray-200"
                style={{ height: "50%" }}
              />
              {i !== node.children.length - 1 && (
                <span
                  className="absolute left-4 top-1/2 bottom-0 w-px bg-gray-200"
                />
              )}
              <span className="absolute left-4 top-1/2 w-4 h-px bg-gray-200" />
              <div className={cn(node.children.length > 1 && "py-2")}>
                <FanBranch node={child} domain={domain} depth={depth + 1} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StructureFanTree({
  root,
  domain,
}: {
  root: StructureTreeNode;
  domain: string | null;
}) {
  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[32rem] py-2">
      <FanBranch node={root} domain={domain} isRoot />
    </div>
  );
}
