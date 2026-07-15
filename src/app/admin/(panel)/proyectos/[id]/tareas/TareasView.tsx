"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp, Calendar, AlertCircle, CheckCircle2, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import UrlLink from "@/components/admin/UrlLink";
import TodoTemplatesCard from "@/components/admin/TodoTemplatesCard";
import { ISSUE_META } from "@/lib/audit/issue-meta";
import { splitManualTask } from "@/lib/tasks";

type Todo = {
  id: string;
  text: string;
  title: string | null;
  detail: string | null;
  priority: string;
  done: boolean;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  issueType: string | null;
  affectedUrls: string[];
};

// Prioridades: etiqueta + clases de color para la pastilla (tarjeta) y para
// el botón activo del formulario. baja=verde, media=ámbar, alta=rojo.
type Priority = "baja" | "media" | "alta";
const PRIORITY_META: Record<Priority, { label: string; badge: string; button: string; dot: string }> = {
  baja: { label: "Baja", badge: "bg-emerald-100 text-emerald-700", button: "Baja", dot: "bg-emerald-500" },
  media: { label: "Media", badge: "bg-amber-100 text-amber-700", button: "Media", dot: "bg-amber-500" },
  alta: { label: "Alta", badge: "bg-red-100 text-red-700", button: "Alta", dot: "bg-red-500" },
};
const PRIORITY_ORDER: Record<Priority, number> = { alta: 0, media: 1, baja: 2 };
function priorityRank(p: string): number {
  return p in PRIORITY_ORDER ? PRIORITY_ORDER[p as Priority] : 1;
}

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
  // Backward compat: tareas legacy sin title/detail se separan de text por
  // saltos de línea (splitManualTask). Las nuevas ya traen title/detail.
  const legacy = todo.title === null ? splitManualTask(todo.text) : null;
  const title = todo.title ?? legacy?.title ?? todo.text;
  const detail = todo.detail ?? legacy?.detail ?? "";
  const prioMeta = PRIORITY_META[todo.priority as Priority] ?? PRIORITY_META.media;

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
        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <span
            className={cn("h-2 w-2 rounded-full shrink-0", prioMeta.dot)}
            title={prioMeta.label}
          />
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
        </div>
        <button
          onClick={onDelete}
          disabled={busy}
          className="p-1 text-gray-300 hover:text-red-600 disabled:opacity-50 shrink-0"
          title="Eliminar tarea"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>

      {detail && (
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
  const [priority, setPriority] = useState<Priority>("media");
  const [dueDate, setDueDate] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pendientes" | "completadas">("pendientes");

  // Aplicador de plantillas (catálogo global de tareas preestablecidas).
  const [tplOpen, setTplOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [selectedTpls, setSelectedTpls] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  // Gestión del catálogo (crear/editar/borrar plantillas) — dentro del módulo
  // de Tareas, ya no en Configuración.
  const [manageOpen, setManageOpen] = useState(false);

  type TemplateItem = { id: string; title: string; detail: string | null; priority: string; category: string | null };

  function loadTemplates() {
    setTplLoading(true);
    fetch("/api/tareas-plantillas")
      .then((r) => r.json())
      .then((d: TemplateItem[]) => {
        if (Array.isArray(d)) setTemplates(d);
      })
      .finally(() => setTplLoading(false));
  }

  function openTemplates() {
    setTplOpen((v) => {
      const next = !v;
      if (next && templates.length === 0) loadTemplates();
      return next;
    });
  }

  function toggleTpl(id: string) {
    setSelectedTpls((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyTemplates() {
    if (selectedTpls.size === 0) return;
    setApplying(true);
    const res = await fetch(`/api/proyectos/${projectId}/todos/from-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateIds: Array.from(selectedTpls) }),
    });
    setApplying(false);
    if (res.ok) {
      setSelectedTpls(new Set());
      setTplOpen(false);
      loadTodos();
    }
  }

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
    setCreating(true);
    const res = await fetch(`/api/proyectos/${projectId}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: trimmedTitle,
        detail: trimmedDetail || undefined,
        priority,
        dueDate: dueDate || undefined,
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Error al crear la tarea");
      return;
    }
    setTitle("");
    setDetail("");
    setPriority("media");
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
  const pendingCount = todos.filter((t) => !t.done).length;
  const completedCount = todos.filter((t) => t.done).length;
  const tabTodos = todos.filter((t) => (tab === "pendientes" ? !t.done : t.done));
  const autoTodos = tabTodos.filter((t) => t.issueType !== null);
  // Pendientes manuales ordenadas por prioridad (alta → media → baja); las
  // completadas respetan el orden del servidor (createdAt desc).
  const manualTodos = tabTodos
    .filter((t) => t.issueType === null)
    .sort((a, b) => {
      if (tab !== "pendientes") return 0;
      return priorityRank(a.priority) - priorityRank(b.priority);
    });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Tareas</h2>
        <p className="text-sm text-gray-500 mt-1">
          Lista de seguimiento del proyecto — manuales y auto-generadas desde hallazgos de
          auditoría. Marca, completa o elimina para tener siempre a la vista lo pendiente.
        </p>
      </div>

      {/* Aplicar tareas preestablecidas desde el catálogo (Configuración) */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <button
          type="button"
          onClick={openTemplates}
          className="flex items-center gap-2 text-sm font-medium text-gray-900"
        >
          <ListChecks className="h-4 w-4 text-gray-500" />
          Aplicar tareas preestablecidas
          <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", tplOpen ? "rotate-180" : "")} />
        </button>
        {tplOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-gray-500">
              Selecciona tareas del catálogo para añadirlas a este proyecto. Puedes crear y editar el
              catálogo más abajo, en &ldquo;Gestionar catálogo de plantillas&rdquo;.
            </p>
            {tplLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-500">No hay plantillas creadas todavía.</p>
            ) : (
              <ul className="space-y-1.5">
                {templates.map((t) => (
                  <li key={t.id}>
                    <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedTpls.has(t.id)}
                        onChange={() => toggleTpl(t.id)}
                        className="h-4 w-4 mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="text-gray-900 font-medium">{t.title}</span>
                        {t.category && <span className="text-xs text-gray-400 ml-1">· {t.category}</span>}
                        {t.detail && <span className="block text-xs text-gray-500">{t.detail}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {templates.length > 0 && (
              <button
                type="button"
                onClick={applyTemplates}
                disabled={applying || selectedTpls.size === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Añadir {selectedTpls.size > 0 ? `(${selectedTpls.size})` : ""}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Gestión del catálogo de plantillas (crear/editar/borrar) */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <button
          type="button"
          onClick={() => setManageOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-gray-900"
        >
          <ListChecks className="h-4 w-4 text-gray-500" />
          Gestionar catálogo de plantillas
          <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", manageOpen ? "rotate-180" : "")} />
        </button>
        {manageOpen && (
          <div className="mt-4">
            <TodoTemplatesCard />
          </div>
        )}
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

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Detalle (opcional)</label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Notas, contexto o pasos adicionales"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 resize-y"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Prioridad</label>
          <div className="flex items-center gap-2">
            {(["baja", "media", "alta"] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors",
                  priority === p
                    ? cn(PRIORITY_META[p].badge, "border-transparent font-medium")
                    : "border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", PRIORITY_META[p].dot)} />
                {PRIORITY_META[p].button}
              </button>
            ))}
          </div>
        </div>

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

      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab("pendientes")}
          className={cn(
            "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "pendientes"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-800"
          )}
        >
          Pendientes ({pendingCount})
        </button>
        <button
          onClick={() => setTab("completadas")}
          className={cn(
            "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "completadas"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-800"
          )}
        >
          Completadas ({completedCount})
        </button>
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : tabTodos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm text-gray-500">
            {tab === "pendientes"
              ? "Sin tareas pendientes — todo al día."
              : "Todavía no se ha completado ninguna tarea."}
          </p>
        </div>
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

          {manualTodos.length > 0 && (
            <div className="space-y-2">
              {autoTodos.length > 0 && <h3 className="text-sm font-semibold text-gray-900">Tareas manuales</h3>}
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
            </div>
          )}
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
