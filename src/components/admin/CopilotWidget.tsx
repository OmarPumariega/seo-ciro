"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Loader2, MessageSquare, Minus, Plus, Send, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectIdFromPath } from "@/lib/hooks/useProjectIdFromPath";
import { useCopilotThreads } from "@/lib/copilot/useCopilotThreads";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

// Widget flotante persistente del Copilot — sustituye a la antigua página
// dedicada (.../proyectos/[id]/copilot). Se monta una sola vez en
// AdminShell.tsx, que no remonta al navegar entre módulos de un proyecto:
// abrir el chat, navegar a otro módulo y volver conserva la conversación
// con `useState` normal, sin Context ni librería de estado nueva.
//
// Solo tiene sentido dentro de un proyecto (el backend del Copilot es
// estrictamente por proyecto, sin endpoint global) — se oculta él solo en
// Panel general/Proyectos/Costes/Configuración.

type WidgetVisualState = "closed" | "open" | "minimized";
type StoredState = { state: WidgetVisualState; activeThreadByProject: Record<string, string> };

const STORAGE_KEY = "seoCiro:copilotWidget";

function readStored(): StoredState {
  if (typeof window === "undefined") return { state: "closed", activeThreadByProject: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: "closed", activeThreadByProject: {} };
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      state: parsed.state === "open" || parsed.state === "minimized" ? parsed.state : "closed",
      activeThreadByProject:
        parsed.activeThreadByProject && typeof parsed.activeThreadByProject === "object"
          ? parsed.activeThreadByProject
          : {},
    };
  } catch {
    return { state: "closed", activeThreadByProject: {} };
  }
}

function writeStored(next: StoredState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage puede fallar en modo privado; nada crítico */
  }
}

export default function CopilotWidget() {
  const projectId = useProjectIdFromPath();
  const {
    threads,
    activeThreadId,
    messages,
    loadingThreads,
    loadingMessages,
    sending,
    error,
    openThread,
    newThread,
    deleteThread,
    sendMessage,
  } = useCopilotThreads(projectId);

  const [widgetState, setWidgetState] = useState<WidgetVisualState>(() => readStored().state);
  const [input, setInput] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showThreadList, setShowThreadList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Al cambiar de proyecto (o al montar), restaura el último hilo activo de
  // ESE proyecto si sigue existiendo — sin arrastrar la conversación del
  // proyecto anterior. useCopilotThreads ya resetea activeThreadId a null
  // en cada cambio de proyecto, así que este efecto solo actúa cuando
  // todavía no hay hilo elegido.
  useEffect(() => {
    if (!projectId || activeThreadId !== null) return;
    const saved = readStored().activeThreadByProject[projectId];
    if (saved && threads.some((t) => t.id === saved)) openThread(saved);
  }, [projectId, threads, activeThreadId, openThread]);

  useEffect(() => {
    const prev = readStored();
    writeStored({ ...prev, state: widgetState });
  }, [widgetState]);

  useEffect(() => {
    if (!projectId) return;
    const prev = readStored();
    const map = { ...prev.activeThreadByProject };
    if (activeThreadId) map[projectId] = activeThreadId;
    else delete map[projectId];
    writeStored({ state: prev.state, activeThreadByProject: map });
  }, [projectId, activeThreadId]);

  useEffect(() => {
    if (widgetState === "open") messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending, widgetState]);

  // El Copilot es estrictamente por proyecto — fuera de uno, no se renderiza.
  if (!projectId) return null;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input;
    if (!text.trim() || sending) return;
    setInput("");
    await sendMessage(text);
  }

  async function handleDeleteConfirmed(threadId: string) {
    setDeleting(true);
    await deleteThread(threadId);
    setDeleting(false);
    setConfirmDeleteId(null);
  }

  const activeThreadTitle = threads.find((t) => t.id === activeThreadId)?.title ?? "Nueva conversación";

  if (widgetState === "closed") {
    return (
      <button
        onClick={() => setWidgetState("open")}
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center hover:bg-gray-800 transition-colors"
        aria-label="Abrir Copilot"
      >
        <Bot className="h-6 w-6" />
      </button>
    );
  }

  if (widgetState === "minimized") {
    return (
      <button
        onClick={() => setWidgetState("open")}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-gray-900 text-white rounded-full pl-4 pr-3.5 py-2.5 shadow-lg hover:bg-gray-800 transition-colors max-w-[280px]"
      >
        <Bot className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium truncate">{activeThreadTitle}</span>
        {sending && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-gray-100 shrink-0">
        <Bot className="h-4 w-4 text-gray-500 shrink-0" />
        <div className="relative flex-1 min-w-0">
          <button
            onClick={() => setShowThreadList((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-gray-900 hover:text-gray-600 max-w-full"
          >
            <span className="truncate">{activeThreadTitle}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </button>
          {showThreadList && (
            <div className="absolute top-full left-0 mt-1 w-72 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-1">
              <button
                onClick={() => {
                  newThread();
                  setShowThreadList(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-3.5 w-3.5" /> Nuevo hilo
              </button>
              {loadingThreads ? (
                <div className="flex justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : threads.length === 0 ? (
                <p className="text-xs text-gray-400 px-2 py-3 text-center">Aún no hay conversaciones.</p>
              ) : (
                threads.map((t) => (
                  <div key={t.id} className="group flex items-center gap-1">
                    <button
                      onClick={() => {
                        openThread(t.id);
                        setShowThreadList(false);
                      }}
                      className={cn(
                        "flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm",
                        activeThreadId === t.id ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate">{t.title}</span>
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(t.id)}
                      className="shrink-0 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                      title="Borrar hilo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <button onClick={newThread} className="p-1 text-gray-400 hover:text-gray-900 shrink-0" title="Nuevo hilo">
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => setWidgetState("minimized")}
          className="p-1 text-gray-400 hover:text-gray-900 shrink-0"
          title="Minimizar"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={() => setWidgetState("closed")}
          className="p-1 text-gray-400 hover:text-gray-900 shrink-0"
          title="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loadingMessages ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <Bot className="h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">
              Pregunta sobre el posicionamiento, la auditoría, las keywords o los costes de este
              proyecto. Las respuestas se basan en datos reales.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed",
                  m.role === "user" ? "bg-gray-900 text-white rounded-br-sm" : "bg-gray-100 text-gray-900 rounded-bl-sm"
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="px-3 py-1.5 text-xs text-red-600 border-t border-gray-100 shrink-0">{error}</div>}

      <form onSubmit={handleSend} className="border-t border-gray-100 p-2.5 flex items-end gap-1.5 shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend(e as unknown as React.FormEvent);
            }
          }}
          rows={1}
          placeholder="Escribe tu pregunta…"
          className="flex-1 resize-none rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent max-h-24"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="shrink-0 flex items-center justify-center rounded-lg bg-gray-900 text-white px-2.5 py-1.5 text-sm hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="¿Borrar este hilo?"
        description="Se pierde toda la conversación. No se puede deshacer."
        busy={deleting}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDeleteConfirmed(confirmDeleteId)}
      />
    </div>
  );
}
