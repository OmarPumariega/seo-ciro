"use client";

import Link from "next/link";
import { X, CheckCircle2 } from "lucide-react";

// Aviso tras importar keywords (Competidores, TF-IDF, Geogrid) al estudio
// General del proyecto — dos enlaces para que el usuario elija dónde seguir,
// sin navegación forzosa. No se autooculta: a diferencia de un toast de
// texto plano, aquí hay una acción que tomar.
export default function ImportSuccessNotice({
  message,
  projectId,
  studyId,
  onDismiss,
}: {
  message: string;
  projectId: string;
  studyId: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 text-sm">
      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-emerald-900">{message}</p>
        <div className="flex items-center gap-3 text-xs font-medium">
          <Link href={`/admin/proyectos/${projectId}/keywords?estudio=${studyId}`} className="text-emerald-700 hover:text-emerald-900 underline">
            Ver en Keywords →
          </Link>
          <Link href={`/admin/proyectos/${projectId}/arquitectura?estudio=${studyId}`} className="text-emerald-700 hover:text-emerald-900 underline">
            Ver en Arquitectura →
          </Link>
        </div>
      </div>
      <button type="button" onClick={onDismiss} className="p-1 text-emerald-400 hover:text-emerald-900 shrink-0" title="Cerrar">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
