"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ISSUE_META } from "@/lib/audit/issue-meta";
import UrlLink from "@/components/admin/UrlLink";

type AuditPage = {
  id: string;
  url: string;
  issues: string[] | null;
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaLength: number | null;
  h1Count: number | null;
  h1Text: string | null;
  metaRobots: string | null;
  statusCode: number | null;
  imagesTotal: number;
  imagesMissingAlt: number;
  brokenLinksCount: number;
  wordCount: number | null;
};

// Contexto breve por tipo de incidencia — el dato concreto que explica por
// qué esa página está en la lista, no solo la URL.
function issueDetail(issue: string, page: AuditPage): string | null {
  switch (issue) {
    case "title_long":
    case "title_short":
    case "missing_title":
    case "duplicate_title":
      return page.title
        ? `"${page.title}"${page.titleLength ? ` (${page.titleLength} car.)` : ""}`
        : "Sin título";
    case "meta_long":
    case "meta_short":
    case "missing_meta":
    case "duplicate_meta":
      return page.metaDescription
        ? `"${page.metaDescription}"${page.metaLength ? ` (${page.metaLength} car.)` : ""}`
        : "Sin meta description";
    case "missing_alt":
      return `${page.imagesMissingAlt}/${page.imagesTotal} imágenes sin alt`;
    case "broken_links":
      return `${page.brokenLinksCount} enlace(s) roto(s)`;
    case "thin_content":
      return `${page.wordCount ?? 0} palabras`;
    case "missing_h1":
    case "multiple_h1":
      return `${page.h1Count ?? 0} H1${page.h1Text ? `: "${page.h1Text}"` : ""}`;
    case "redirect":
      return page.statusCode ? `HTTP ${page.statusCode}` : null;
    case "noindex":
      return page.metaRobots;
    default:
      return null;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="Copiar URL"
      className="p-1 text-gray-400 hover:text-gray-700 rounded shrink-0"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function IssueRow({ issue, pages }: { issue: string; pages: AuditPage[] }) {
  const [open, setOpen] = useState(false);
  const meta = ISSUE_META[issue];
  if (!meta) return null;

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-orange-100 text-orange-600 shrink-0">
          <AlertCircle className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-medium text-gray-900 flex-1">{meta.label}</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
          {pages.length} {pages.length === 1 ? "página" : "páginas"}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-600">{meta.description}</p>

          {meta.fix ? (
            <div className="bg-blue-50 text-blue-900 text-sm px-3 py-2 rounded-lg">
              <span className="font-medium">Cómo arreglarlo: </span>
              {meta.fix}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">
              Señal informativa — puede ser intencional, revisar caso a caso.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-1.5 pr-3 font-medium">Página</th>
                  <th className="py-1.5 px-3 font-medium">Detalle</th>
                  <th className="py-1.5 pl-3 font-medium w-8" />
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => {
                  const detail = issueDetail(issue, page);
                  return (
                    <tr key={page.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-xs break-all max-w-xs">
                        <UrlLink url={page.url} />
                      </td>
                      <td className="py-1.5 px-3 text-xs text-gray-500 break-all">{detail ?? "—"}</td>
                      <td className="py-1.5 pl-3">
                        <CopyButton text={page.url} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditIssuesList({
  pages,
  issueCodes,
  gscChecked,
}: {
  pages: AuditPage[];
  issueCodes: string[];
  gscChecked: boolean;
}) {
  const { failing, passing } = useMemo(() => {
    // Sin conexión GSC, "no_gsc_impressions" ni se afirma ni se niega — se
    // excluye de ambas listas en vez de fabricar un resultado.
    const relevantCodes = issueCodes.filter((c) => c !== "no_gsc_impressions" || gscChecked);
    const byIssue = new Map<string, AuditPage[]>();
    for (const page of pages) {
      for (const issue of page.issues ?? []) {
        if (!relevantCodes.includes(issue)) continue;
        const arr = byIssue.get(issue) ?? [];
        arr.push(page);
        byIssue.set(issue, arr);
      }
    }
    const failing = relevantCodes
      .filter((c) => (byIssue.get(c)?.length ?? 0) > 0)
      .sort((a, b) => (byIssue.get(b)?.length ?? 0) - (byIssue.get(a)?.length ?? 0))
      .map((issue) => ({ issue, pages: byIssue.get(issue) ?? [] }));
    const passing = relevantCodes.filter((c) => !(byIssue.get(c)?.length ?? 0));
    return { failing, passing };
  }, [pages, issueCodes, gscChecked]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Problemas a corregir {failing.length > 0 && `(${failing.length})`}
        </h3>
        {failing.length === 0 ? (
          <p className="text-sm text-gray-500">Sin incidencias en esta categoría.</p>
        ) : (
          <div className="space-y-2">
            {failing.map(({ issue, pages }) => (
              <IssueRow key={issue} issue={issue} pages={pages} />
            ))}
          </div>
        )}
      </div>

      {passing.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Reglas aprobadas</h3>
          <div className="space-y-1.5">
            {passing.map((issue) => (
              <div
                key={issue}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg bg-emerald-50/60 text-emerald-800"
                )}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-sm">{ISSUE_META[issue]?.passText}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
