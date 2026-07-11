"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Plus, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Thread = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
};

export default function CopilotView({ projectId }: { projectId: string }) {
  const base = `/api/proyectos/${projectId}/copilot`;

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  async function loadThreads() {
    setLoadingThreads(true);
    setError("");
    try {
      const res = await fetch(base);
      if (!res.ok) throw new Error("No se pudieron cargar los hilos");
      const data: ThreadSummary[] = await res.json();
      setThreads(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoadingThreads(false);
    }
  }

  async function openThread(threadId: string) {
    setActiveThreadId(threadId);
    setMessages([]);
    setLoadingMessages(true);
    setError("");
    try {
      const res = await fetch(`${base}/${threadId}`);
      if (!res.ok) throw new Error("No se pudo cargar el hilo");
      const data: Thread = await res.json();
      setMessages((data.messages as Message[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoadingMessages(false);
    }
  }

  function newThread() {
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setError("");
    inputRef.current?.focus();
  }

  async function deleteThread(threadId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await fetch(`${base}/${threadId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo borrar el hilo");
      if (activeThreadId === threadId) newThread();
      await loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al borrar");
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    setError("");

    const sendThreadId = activeThreadId;

    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          threadId: sendThreadId ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al contactar con el Copilot");
      }
      const data: { threadId: string; message: string } = await res.json();
      setActiveThreadId(data.threadId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      await loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      // Revierte el mensaje optimista del usuario si el envío falló.
      setMessages((prev) => prev.filter((m) => m !== userMsg));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-14rem)] min-h-[520px]">
      {/* Sidebar — lista de hilos */}
      <aside className="bg-white rounded-xl border border-gray-100 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-100">
          <button
            onClick={newThread}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-900 text-white text-sm font-medium px-3 py-2 hover:bg-gray-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuevo hilo
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingThreads ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : threads.length === 0 ? (
            <p className="text-xs text-gray-400 px-2 py-4 text-center">
              Aún no hay conversaciones.
            </p>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t.id)}
                className={cn(
                  "group w-full flex items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                  activeThreadId === t.id
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
                <span className="flex-1 truncate">{t.title}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => void deleteThread(t.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void deleteThread(t.id, e as unknown as React.MouseEvent);
                  }}
                  className="shrink-0 text-gray-300 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Borrar hilo"
                >
                  <Trash2 className="h-4 w-4" />
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Panel de mensajes */}
      <section className="bg-white rounded-xl border border-gray-100 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          {loadingMessages ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <MessageSquare className="h-10 w-10 text-gray-300 mb-3" />
              <h2 className="text-base font-semibold text-gray-900">Copilot SEO</h2>
              <p className="mt-1 text-sm text-gray-500 max-w-sm">
                Pregunta sobre el posicionamiento, la auditoría, las keywords o los
                costes de este proyecto. Las respuestas se basan en datos reales.
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                    m.role === "user"
                      ? "bg-gray-900 text-white rounded-br-sm"
                      : "bg-gray-100 text-gray-900 rounded-bl-sm"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="px-4 py-2 text-sm text-red-600 border-t border-gray-100">
            {error}
          </div>
        )}

        <form
          onSubmit={sendMessage}
          className="border-t border-gray-100 p-3 flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(e as unknown as React.FormEvent);
              }
            }}
            rows={1}
            placeholder="Escribe tu pregunta sobre el proyecto…"
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent max-h-32"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="shrink-0 flex items-center justify-center rounded-lg bg-gray-900 text-white px-3 py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </section>
    </div>
  );
}
