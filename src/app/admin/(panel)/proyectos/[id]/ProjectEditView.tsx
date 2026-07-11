"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import ProjectForm, { type ProjectFormValues } from "@/components/admin/ProjectForm";

type ProjectRecord = ProjectFormValues & { id: string };

export default function ProjectEditView({ project }: { project: ProjectRecord }) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleSubmit(values: ProjectFormValues) {
    const res = await fetch(`/api/proyectos/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Error al guardar el proyecto";
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/proyectos/${project.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? "Error al eliminar el proyecto");
      return;
    }
    router.push("/admin/proyectos");
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setConfirmingDelete(true)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
          Eliminar proyecto
        </button>
      </div>

      <ProjectForm
        initial={project}
        showSlug={false}
        submitLabel="Guardar cambios"
        onSubmit={handleSubmit}
      />

      {confirmingDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Eliminar proyecto</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Vas a eliminar <strong className="text-gray-800">{project.name}</strong>. Esta
                  acción <strong className="text-red-600">no se puede deshacer</strong>.
                </p>
              </div>
            </div>
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-4">{deleteError}</p>
            )}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeleteError("");
                }}
                disabled={deleting}
                className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
