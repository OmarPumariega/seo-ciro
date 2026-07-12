"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp, Calendar, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import UrlLink from "@/components/admin/UrlLink";
import { ISSUE_META } from "@/lib/audit/issue-meta";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  issueType: string | null;
  affectedUrls: string[];
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Tarea auto-generada desde un hallazgo de auditoría (issueType no null) —
// misma idea visual que "Problemas a corregir" en Auditoría: título +
// contador, colapsable, con el "cómo arreglarlo" y la lista de páginas
// completas y clicables (nunca texto plano recortado a 5 ejemplos).
function AutoTaskCard({
  todo,
  busy,
  onToggleDone,
  onDelete,
}: {
  todo: Todo;
  busy: boolean;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = todo.issueType ? ISSUE_META[todo.issueType] : undefined;
  if (!meta) return null;

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={todo.done}
          onChange={onToggleDone}
          disabled={busy}
          title={todo.done ? "Marcar como pendiente" : "Marcar como resuelta"}
          className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400 shrink-0"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <span
            className={cn(
              "flex items-center justify-center h-6 w-6 rounded-full shrink-0",
              todo.done ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600"
            )}
          >
            {todo.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          </span>
          <span className={cn("text-sm font-medium truncate", todo.done ? "text-gray-400 line-through" : "text-gray-900")}>
            {meta.label}
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
            {todo.affectedUrls.length} {todo.affectedUrls.length === 1 ? "página" : "páginas"}
          </span>
          <span className="flex-1" />
          {open ? (
            <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          )}
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="p-1 text-gray-300 hover:text-red-600 disabled:opacity-50 shrink-0"
          title="Eliminar tarea"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          <p className="text-sm text-gray-600">{meta.description}</p>
          <div className="bg-blue-50 text-blue-900 text-sm px-3 py-2 rounded-lg">
            <span className="font-medium">Cómo arreglarlo: </span>
            {meta.fix}
          </div>
          {todo.affectedUrls.length > 0 && (
            <ul className="space-y-1">
              {todo.affectedUrls.map((u) => (
                <li key={u}>
                  <UrlLink url={u} className="text-xs" />
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-gray-400">
            Detectado el {new Date(todo.createdAt).toLocaleDateString("es-ES")}
            {todo.done && todo.completedAt
              ? ` · resuelta o superada por una auditoría más reciente el ${new Date(todo.completedAt).toLocaleDateString("es-ES")}`
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// Divide el texto libre de una tarea manual en "título" (primera línea) +
// "detalle" (el resto) — mismo patrón visual que AutoTaskCard: colapsada solo
// se ve el título, y al desplegar aparece el resto del texto. Las tareas
// antiguas de una sola línea simplemente no tienen chevron (nada que ocultar).
function splitManualTask(text: string): { title: string; detail: string } {
  const idx = text.indexOf("\n");
  if (idx === -1) return { title: text, detail: "" };
  return { title: text.slice(0, idx).trim(), detail: text.slice(idx + 1).trim() };
}

function ManualTaskCard({
  todo,
  overdue,
  busy,
  onToggleDone,
  onDelete,
}: {
  todo: Todo;
  overdue: boolean;
  busy: boolean;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { title, detail } = splitManualTask(todo.text);
  const hasDetail = detail.length > 0;

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={todo.done}
          onChange={onToggleDone}
          disabled={busy}
          title={todo.done ? "Marcar como pendiente" : "Marcar como completada"}
          className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400 shrink-0"
        />
        <button
          type="button"
          onClick={() => hasDetail && setOpen((v) => !v)}
          className={cn("flex items-center gap-3 flex-1 min-w-0 text-left", !hasDetail && "cursor-default")}
        >
          <span className={cn("text-sm truncate", todo.done ? "text-gray-400 line-through" : "text-gray-900")}>
            {title}
          </span>
          {todo.dueDate && (
            <span
              className={cn(
                "text-[11px] px-2 py-0.5 rounded-full shrink-0",
                overdue ? "bg-red-100 text-red-700 font-medium" : "bg-gray-100 text-gray-600"
              )}
            >
              {overdue ? "vencida " : "vence "}
              {new Date(todo.dueDate).toLocaleDateString("es-ES")}
            </span>
          )}
          <span className="flex-1" />
          {hasDetail &&
            (open ? (
              <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
            ))}
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="p-1 text-gray-300 hover:text-red-600 disabled:opacity-50 shrink-0"
          title="Eliminar tarea"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>

      {open && hasDetail && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2">
          <p className={cn("text-sm whitespace-pre-line", todo.done ? "text-gray-400" : "text-gray-600")}>
            {detail}
          </p>
          <p className="text-[11px] text-gray-400">
            Creada el {new Date(todo.createdAt).toLocaleDateString("es-ES")}
          </p>
        </div>
      )}
    </div>
  );
}

export default function TareasView({ projectId }: { projectId: string }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function loadTodos() {
    return fetch(`/api/proyectos/${projectId}/todos`)
      .then((r) => r.json())
      .then((d: Todo[] | { error: string }) => {
        if (Array.isArray(d)) setTodos(d);
      });
  }

  useEffect(() => {
    loadTodos().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedDetail = detail.trim();
    // El título va siempre en la primera línea; el detalle (si lo hay) en el
    // resto — es lo que ManualTaskCard separa para mostrar colapsado/expandido.
    const text = trimmedDetail ? `${trimmedTitle}\n${trimmedDetail}` : trimmedTitle;
    setCreating(true);
    const res = await fetch(`/api/proyectos/${projectId}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, dueDate: dueDate || undefined }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Error al crear la tarea");
      return;
    }
    setTitle("");
    setDetail("");
    setShowDetail(false);
    setDueDate("");
    setShowDate(false);
    loadTodos();
  }

  async function toggleDone(todo: Todo) {
    setBusyId(todo.id);
    const res = await fetch(`/api/proyectos/${projectId}/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !todo.done }),
    });
    setBusyId(null);
    if (res.ok) loadTodos();
  }

  async function handleDelete(todoId: string) {
    setBusyId(todoId);
    const res = await fetch(`/api/proyectos/${projectId}/todos/${todoId}`, {
      method: "DELETE",
    });
    setBusyId(null);
    setConfirmDeleteId(null);
    if (res.ok) loadTodos();
  }

  const today = startOfToday();
  const autoTodos = todos.filter((t) => t.issueType !== null);
  const manualTodos = todos.filter((t) => t.issueType === null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Tareas</h2>
        <p className="text-sm text-gray-500 mt-1">
          Lista de seguimiento del proyecto — manuales y auto-generadas desde hallazgos de
          auditoría. Marca, completa o elimina para tener siempre a la vista lo pendiente.
        </p>
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="block text-sm font-medium text-gray-700">Título de la tarea</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Revisar títulos de la home"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Añadir tarea
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetail && "rotate-180")} />
          Añadir detalle (opcional)
        </button>
        {showDetail && (
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Notas, contexto o pasos adicionales — se ven al desplegar la tarea"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 resize-y"
          />
        )}

        <button
          type="button"
          onClick={() => setShowDate((v) => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDate && "rotate-180")} />
          Fecha de vencimiento (opcional)
        </button>
        {showDate && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
            {dueDate && (
              <button
                type="button"
                onClick={() => setDueDate("")}
                className="text-xs text-gray-400 hover:text-gray-900"
              >
                Quitar fecha
              </button>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      </form>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : (
        <>
          {autoTodos.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">
                Hallazgos de auditoría ({autoTodos.length})
              </h3>
              <div className="space-y-2">
                {autoTodos.map((todo) => (
                  <AutoTaskCard
                    key={todo.id}
                    todo={todo}
                    busy={busyId === todo.id}
                    onToggleDone={() => toggleDone(todo)}
                    onDelete={() => setConfirmDeleteId(todo.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {autoTodos.length > 0 && <h3 className="text-sm font-semibold text-gray-900">Tareas manuales</h3>}
            {manualTodos.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-sm text-gray-500">
                  {autoTodos.length > 0
                    ? "Sin tareas manuales todavía."
                    : "Todavía no hay tareas para este proyecto."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {manualTodos.map((todo) => {
                  const overdue = !todo.done && todo.dueDate !== null && new Date(todo.dueDate) < today;
                  return (
                    <ManualTaskCard
                      key={todo.id}
                      todo={todo}
                      overdue={overdue}
                      busy={busyId === todo.id}
                      onToggleDone={() => toggleDone(todo)}
                      onDelete={() => setConfirmDeleteId(todo.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="¿Eliminar esta tarea?"
        description="No se puede deshacer."
        busy={busyId === confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
      />
    </div>
  );
}
