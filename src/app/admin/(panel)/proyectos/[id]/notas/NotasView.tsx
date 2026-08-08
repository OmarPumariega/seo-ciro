"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

type Note = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

function NoteCard({
  note,
  busy,
  onSave,
  onDelete,
}: {
  note: Note;
  busy: boolean;
  onSave: (content: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === note.content) {
      setEditing(false);
      setDraft(note.content);
      return;
    }
    await onSave(trimmed);
    setEditing(false);
  }

  const edited = note.updatedAt !== note.createdAt;

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <div className="px-4 py-3 space-y-2">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={10000}
              rows={4}
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 resize-y"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || !draft.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(note.content);
                  setEditing(false);
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-900"
              >
                <X className="h-3.5 w-3.5" />
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-800 whitespace-pre-line">{note.content}</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-gray-400">
                {new Date(note.createdAt).toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {edited ? " · editado" : ""}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setEditing(true)}
                  disabled={busy}
                  className="p-1 text-gray-300 hover:text-gray-900 disabled:opacity-50"
                  title="Editar apunte"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onDelete}
                  disabled={busy}
                  className="p-1 text-gray-300 hover:text-red-600 disabled:opacity-50"
                  title="Eliminar apunte"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function NotasView({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function loadNotes() {
    return fetch(`/api/proyectos/${projectId}/notas`)
      .then((r) => r.json())
      .then((d: Note[] | { error: string }) => {
        if (Array.isArray(d)) setNotes(d);
      });
  }

  useEffect(() => {
    loadNotes().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = content.trim();
    if (!trimmed) return;
    setCreating(true);
    const res = await fetch(`/api/proyectos/${projectId}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: trimmed }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Error al crear el apunte");
      return;
    }
    setContent("");
    loadNotes();
  }

  async function handleUpdate(noteId: string, newContent: string) {
    setBusyId(noteId);
    const res = await fetch(`/api/proyectos/${projectId}/notas/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    setBusyId(null);
    if (res.ok) loadNotes();
  }

  async function handleDelete(noteId: string) {
    setBusyId(noteId);
    const res = await fetch(`/api/proyectos/${projectId}/notas/${noteId}`, {
      method: "DELETE",
    });
    setBusyId(null);
    setConfirmDeleteId(null);
    if (res.ok) loadNotes();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Notas</h2>
        <p className="text-sm text-gray-500 mt-1">
          Apuntes internos del negocio del cliente — acuerdos, contactos, cosas a recordar.
          No son tareas ni aparecen en el Informe.
        </p>
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Nuevo apunte</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={10000}
            rows={3}
            placeholder="Escribe aquí un apunte sobre el negocio del cliente…"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 resize-y"
          />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <button
          type="submit"
          disabled={creating || !content.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Añadir apunte
        </button>
      </form>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : notes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Todavía no hay apuntes para este proyecto.</p>
        </div>
      ) : (
        <div className={cn("space-y-2")}>
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              busy={busyId === note.id}
              onSave={(newContent) => handleUpdate(note.id, newContent)}
              onDelete={() => setConfirmDeleteId(note.id)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="¿Eliminar este apunte?"
        description="No se puede deshacer."
        busy={busyId === confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
      />
    </div>
  );
}
