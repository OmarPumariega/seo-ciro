"use client";

import { useEffect, useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Loader2, ChevronDown, Sparkles, GitFork, RefreshCw } from "lucide-react";
import { normalizeKeyword } from "@/lib/keywords/normalize";
import { buildStructureTree, type StructureTreeNode } from "@/lib/keywords/structure-tree";
import type { StructureProposal } from "@/lib/keywords/structure";
import StructureFanTree from "@/components/admin/StructureFanTree";

type StudyListItem = {
  id: string;
  name: string;
  _count: { keywords: number };
  hasStructure: boolean;
};

type StudyKeyword = { keyword: string; searchVolume: number | null };

type StudyDetail = {
  id: string;
  name: string;
  structure: StructureProposal | null;
  structureModel: string | null;
  updatedAt: string;
  keywords: StudyKeyword[];
};

export default function ArquitecturaView({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string | null;
}) {
  const [studies, setStudies] = useState<StudyListItem[]>([]);
  const [loadingStudies, setLoadingStudies] = useState(true);
  const [studyId, setStudyId] = useState("");
  const [study, setStudy] = useState<StudyDetail | null>(null);
  const [loadingStudy, setLoadingStudy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/proyectos/${projectId}/keywords/estudios`)
      .then((r) => r.json())
      .then((list: StudyListItem[]) => {
        if (Array.isArray(list)) {
          setStudies(list);
          // Preselecciona el primer estudio que ya tenga keywords — el
          // usuario puede cambiarlo, esto solo evita una pantalla vacía.
          const withKeywords = list.find((s) => s._count.keywords > 0);
          if (withKeywords) setStudyId(withKeywords.id);
        }
      })
      .finally(() => setLoadingStudies(false));
  }, [projectId]);

  useEffect(() => {
    if (!studyId) {
      setStudy(null);
      return;
    }
    setLoadingStudy(true);
    setError("");
    fetch(`/api/proyectos/${projectId}/keywords/estudios/${studyId}`)
      .then((r) => r.json())
      .then((d: StudyDetail) => {
        if (d && d.id) setStudy(d);
      })
      .finally(() => setLoadingStudy(false));
  }, [projectId, studyId]);

  async function handleGenerate() {
    if (!studyId) return;
    setGenerating(true);
    setError("");
    const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios/${studyId}/estructura`, {
      method: "POST",
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(data.error ?? "Error al generar la estructura");
      return;
    }
    setStudy((prev) =>
      prev ? { ...prev, structure: data.structure, structureModel: data.structureModel, updatedAt: data.updatedAt } : prev
    );
    // Refresca la lista para que el badge "hasStructure" quede al día.
    setStudies((prev) => prev.map((s) => (s.id === studyId ? { ...s, hasStructure: true } : s)));
  }

  const volumeByKeyword = new Map<string, number>(
    (study?.keywords ?? [])
      .filter((k) => k.searchVolume !== null)
      .map((k) => [normalizeKeyword(k.keyword), k.searchVolume as number])
  );

  const tree: StructureTreeNode | null =
    study?.structure && study.structure.pages.length > 0
      ? buildStructureTree(study.structure.pages, volumeByKeyword)
      : null;

  const totalVolume = tree?.volume ?? 0;
  const pageCount = study?.structure?.pages.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Arquitectura de la web</h2>
        <p className="text-sm text-gray-500 mt-1">
          Jerarquía de páginas recomendada a partir de un estudio de keywords (Módulo 1) — agrupa las
          keywords reales del estudio por volumen de búsqueda y propone la URL optimizada de cada
          página.
        </p>
      </div>

      {/* Selector de estudio */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px] space-y-1">
            <label className="block text-xs font-medium text-gray-500">Estudio de keywords (Módulo 1)</label>
            {loadingStudies ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : studies.length === 0 ? (
              <p className="text-sm text-gray-500">
                Aún no hay estudios de keywords en este proyecto — crea uno en la pestaña Keywords.
              </p>
            ) : (
              <Select.Root value={studyId} onValueChange={setStudyId}>
                <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
                  <Select.Value placeholder="Selecciona un estudio" />
                  <Select.Icon><ChevronDown className="h-4 w-4 text-gray-400" /></Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50 max-h-60">
                    <Select.Viewport>
                      {studies.map((s) => (
                        <Select.Item key={s.id} value={s.id} className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100">
                          <Select.ItemText>
                            {s.name} ({s._count.keywords}){s.hasStructure ? " · con estructura" : ""}
                          </Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            )}
          </div>
          {studyId && study && study.keywords.length > 0 && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 shrink-0"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : study.structure ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {study.structure ? "Regenerar estructura" : "Generar estructura"}
            </button>
          )}
        </div>
        {study && study.keywords.length === 0 && (
          <p className="text-xs text-amber-600">
            Este estudio todavía no tiene keywords — añádelas en la pestaña Keywords antes de generar
            la arquitectura.
          </p>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <p className="text-xs text-gray-400">
          La agrupación en páginas y su jerarquía las genera un modelo de IA (OpenRouter) a partir de
          las keywords reales del estudio (volumen, intención, prioridad) — el volumen mostrado en el
          árbol es siempre el real acumulado, no una estimación de la IA.
        </p>
      </div>

      {/* Árbol en abanico */}
      {loadingStudy ? (
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      ) : tree ? (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <GitFork className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">
                {pageCount} página{pageCount === 1 ? "" : "s"} propuesta{pageCount === 1 ? "" : "s"}
              </h3>
            </div>
            <p className="text-xs text-gray-400">
              {totalVolume.toLocaleString("es-ES")} vol. total cubierto
              {study?.structureModel && <> · generado con {study.structureModel}</>}
              {study?.updatedAt && <> · {new Date(study.updatedAt).toLocaleDateString("es-ES")}</>}
            </p>
          </div>
          <p className="text-xs text-gray-400">
            Haz clic en el icono de cada rama para desplegar las páginas hijas. El orden dentro de
            cada rama es por volumen de búsqueda real, de mayor a menor.
          </p>
          <StructureFanTree root={tree} domain={domain} />
        </div>
      ) : study && !study.structure ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center space-y-2">
          <GitFork className="h-6 w-6 text-gray-300 mx-auto" />
          <p className="text-sm text-gray-500">
            Este estudio todavía no tiene una arquitectura generada.
          </p>
          {study.keywords.length > 0 && (
            <p className="text-xs text-gray-400">
              Pulsa «Generar estructura» arriba para crearla a partir de sus {study.keywords.length}{" "}
              keywords.
            </p>
          )}
        </div>
      ) : !loadingStudies && studies.length > 0 && !studyId ? (
        <p className="text-sm text-gray-500">Selecciona un estudio para ver o generar su arquitectura.</p>
      ) : null}
    </div>
  );
}
