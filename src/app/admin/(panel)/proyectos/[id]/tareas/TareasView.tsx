"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ChevronDown, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function TareasView({ projectId }: { projectId: string }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

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
    const trimmed = text.trim();
    if (!trimmed) return;
    setCreating(true);
    const res = await fetch(`/api/proyectos/${projectId}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, dueDate: dueDate || undefined }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Error al crear la tarea");
      return;
    }
    setText("");
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
    if (res.ok) loadTodos();
  }

  const today = startOfToday();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Tareas</h2>
        <p className="text-sm text-gray-500 mt-1">
          Lista de seguimiento del proyecto. Marca, completa o elimina tareas para
          tener siempre a la vista lo pendiente.
        </p>
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="block text-sm font-medium text-gray-700">Nueva tarea</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="Revisar títulos de la home"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !text.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Añadir tarea
          </button>
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

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : todos.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no hay tareas para este proyecto.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {todos.map((todo) => {
              const overdue =
                !todo.done && todo.dueDate !== null && new Date(todo.dueDate) < today;
              return (
                <li key={todo.id} className="flex items-center gap-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => toggleDone(todo)}
                    disabled={busyId === todo.id}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm whitespace-pre-line",
                        todo.done ? "line-through text-gray-400" : "text-gray-900"
                      )}
                    >
                      {todo.text}
                    </p>
                    {todo.dueDate && (
                      <p
                        className={cn(
                          "text-xs mt-0.5",
                          overdue ? "text-red-600 font-medium" : "text-gray-500"
                        )}
                      >
                        Vence: {new Date(todo.dueDate).toLocaleDateString("es-ES")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(todo.id)}
                    disabled={busyId === todo.id}
                    className="p-1 text-gray-300 hover:text-red-600 disabled:opacity-50"
                    title="Eliminar tarea"
                  >
                    {busyId === todo.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
