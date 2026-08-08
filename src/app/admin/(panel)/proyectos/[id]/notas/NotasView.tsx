"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, X, Check, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { NOTE_IMAGE_MAX_COUNT, NOTE_TITLE_MAX_LENGTH } from "@/lib/notes/constants";

type NoteImage = {
  id: string;
  mimeType: string;
  filename: string | null;
  size: number;
};

type Note = {
  id: string;
  title: string | null;
  content: string;
  images: NoteImage[];
  createdAt: string;
  updatedAt: string;
};

function imageUrl(projectId: string, noteId: string, imageId: string) {
  return `/api/proyectos/${projectId}/notas/${noteId}/imagenes/${imageId}`;
}

// Miniaturas de las fotos ya subidas de un apunte. Clic = ver a tamaño real
// en una pestaña nueva (no hay galería/lightbox propia — no compensa el
// código extra para un puñado de fotos de referencia).
function ImageGrid({
  projectId,
  noteId,
  images,
  onDelete,
}: {
  projectId: string;
  noteId: string;
  images: NoteImage[];
  onDelete?: (imageId: string) => void;
}) {
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img) => (
        <div key={img.id} className="relative group">
          <a href={imageUrl(projectId, noteId, img.id)} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl(projectId, noteId, img.id)}
              alt={img.filename ?? "Foto adjunta"}
              className="h-20 w-20 object-cover rounded-lg border border-gray-200"
            />
          </a>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(img.id)}
              title="Quitar foto"
              className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full p-0.5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Selector de fotos pendientes de subir (antes de crear el apunte, o para
// añadir a uno existente). Solo mantiene los File en memoria + una preview
// local — la subida real ocurre al guardar.
function PendingImagePicker({
  files,
  onChange,
  disabled,
  remainingSlots,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  remainingSlots: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Derivado directamente de `files`, no es estado propio: evita el
  // cascading render de fijar el resultado de un efecto con setState.
  // La creación de las object URL es un efecto secundario asumible en
  // render (barato, sin llamada a red) — solo la limpieza necesita un
  // useEffect, y ese no toca estado.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u));
  }, [previews]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    onChange([...files, ...picked].slice(0, files.length + remainingSlots));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {previews.map((url, i) => (
          <div key={url} className="relative group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={files[i].name} className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
            <button
              type="button"
              onClick={() => onChange(files.filter((_, idx) => idx !== i))}
              disabled={disabled}
              className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full p-0.5 text-gray-400 hover:text-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {remainingSlots > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            title="Adjuntar fotos"
            className="h-20 w-20 flex items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 disabled:opacity-50"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handlePick}
      />
    </div>
  );
}

function NoteCard({
  projectId,
  note,
  busy,
  onSave,
  onDelete,
  onAddImages,
  onDeleteImage,
}: {
  projectId: string;
  note: Note;
  busy: boolean;
  onSave: (title: string, content: string) => Promise<void>;
  onDelete: () => void;
  onAddImages: (files: File[]) => Promise<void>;
  onDeleteImage: (imageId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(note.title ?? "");
  const [draftContent, setDraftContent] = useState(note.content);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  async function handleSave() {
    const trimmedTitle = draftTitle.trim();
    const contentText = draftContent.replace(/<[^>]*>/g, "").trim();
    if (!contentText) return;

    await onSave(trimmedTitle, draftContent);
    if (pendingFiles.length > 0) {
      setUploading(true);
      await onAddImages(pendingFiles);
      setUploading(false);
      setPendingFiles([]);
    }
    setEditing(false);
  }

  const edited = note.updatedAt !== note.createdAt;

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <div className="px-4 py-3 space-y-2">
        {editing ? (
          <div className="space-y-2">
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              maxLength={NOTE_TITLE_MAX_LENGTH}
              placeholder="Título (opcional)"
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium outline-none focus:border-gray-400"
            />
            <RichTextEditor value={draftContent} onChange={setDraftContent} disabled={busy || uploading} />
            <PendingImagePicker
              files={pendingFiles}
              onChange={setPendingFiles}
              disabled={busy || uploading}
              remainingSlots={NOTE_IMAGE_MAX_COUNT - note.images.length - pendingFiles.length}
            />
            <ImageGrid projectId={projectId} noteId={note.id} images={note.images} onDelete={onDeleteImage} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {busy || uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftTitle(note.title ?? "");
                  setDraftContent(note.content);
                  setPendingFiles([]);
                  setEditing(false);
                }}
                disabled={busy || uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-900"
              >
                <X className="h-3.5 w-3.5" />
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            {note.title && <p className="text-sm font-semibold text-gray-900">{note.title}</p>}
            <div
              className="tiptap text-sm text-gray-800"
              dangerouslySetInnerHTML={{ __html: note.content }}
            />
            <ImageGrid projectId={projectId} noteId={note.id} images={note.images} />
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

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
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

  async function uploadImages(noteId: string, files: File[]) {
    const form = new FormData();
    files.forEach((f) => form.append("images", f));
    const res = await fetch(`/api/proyectos/${projectId}/notas/${noteId}/imagenes`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "El apunte se guardó pero las fotos no se pudieron subir");
    }
    await loadNotes();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const contentText = content.replace(/<[^>]*>/g, "").trim();
    if (!contentText) return;
    setCreating(true);
    const res = await fetch(`/api/proyectos/${projectId}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreating(false);
      setError(data.error ?? "Error al crear el apunte");
      return;
    }
    if (pendingFiles.length > 0) {
      await uploadImages(data.id, pendingFiles);
    }
    setCreating(false);
    setTitle("");
    setContent("");
    setPendingFiles([]);
    loadNotes();
  }

  async function handleUpdate(noteId: string, newTitle: string, newContent: string) {
    setBusyId(noteId);
    const res = await fetch(`/api/proyectos/${projectId}/notas/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, content: newContent }),
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

  async function handleDeleteImage(noteId: string, imageId: string) {
    await fetch(`/api/proyectos/${projectId}/notas/${noteId}/imagenes/${imageId}`, {
      method: "DELETE",
    });
    loadNotes();
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
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={NOTE_TITLE_MAX_LENGTH}
            placeholder="Título (opcional)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder="Escribe aquí un apunte sobre el negocio del cliente…"
          />
        </div>
        <PendingImagePicker
          files={pendingFiles}
          onChange={setPendingFiles}
          disabled={creating}
          remainingSlots={NOTE_IMAGE_MAX_COUNT - pendingFiles.length}
        />
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <button
          type="submit"
          disabled={creating || !content.replace(/<[^>]*>/g, "").trim()}
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
              projectId={projectId}
              note={note}
              busy={busyId === note.id}
              onSave={(newTitle, newContent) => handleUpdate(note.id, newTitle, newContent)}
              onDelete={() => setConfirmDeleteId(note.id)}
              onAddImages={(files) => uploadImages(note.id, files)}
              onDeleteImage={(imageId) => handleDeleteImage(note.id, imageId)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="¿Eliminar este apunte?"
        description="No se puede deshacer. Las fotos adjuntas también se borran."
        busy={busyId === confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
      />
    </div>
  );
}
