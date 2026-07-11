"use client";

import { cn } from "@/lib/utils";

// Modal de confirmación reutilizable — antes cada vista borraba al primer
// clic (Tareas, Keywords, Competidores, Copilot) o tenía su propio modal
// hecho a mano (ProjectEditView). Un solo componente para las cuatro.
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div>
          <h3 id="confirm-dialog-title" className="text-sm font-semibold text-gray-900">
            {title}
          </h3>
          {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg text-white disabled:opacity-50",
              danger ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-gray-800"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
