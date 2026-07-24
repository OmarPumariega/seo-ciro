"use client";

import { useCallback, useEffect, useState } from "react";

// Lógica de hilos/mensajes del Copilot, extraída de la antigua página
// dedicada (CopilotView.tsx) para que el widget flotante la reutilice sin
// copiar y pegar. Backend sin cambios: mismas 3 rutas de siempre
// (GET/POST /api/proyectos/[id]/copilot, GET/DELETE .../copilot/[threadId]).
// No-streaming (una sola petición POST con await), igual que antes.

export type ThreadSummary = { id: string; title: string; updatedAt: string };
export type Message = { role: "user" | "assistant"; content: string };
type ThreadDetail = { id: string; title: string; messages: Message[]; updatedAt: string };

export function useCopilotThreads(projectId: string | null) {
  const base = projectId ? `/api/proyectos/${projectId}/copilot` : null;

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadThreads = useCallback(async () => {
    if (!base) return;
    setLoadingThreads(true);
    setError("");
    try {
      const res = await fetch(base);
      if (!res.ok) throw new Error("No se pudieron cargar los hilos");
      setThreads(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoadingThreads(false);
    }
  }, [base]);

  // Recarga los hilos (y limpia la conversación activa) cada vez que cambia
  // el proyecto — el widget vive en un layout que no remonta al navegar, así
  // que sin esto arrastraría los hilos del proyecto anterior.
  useEffect(() => {
    setActiveThreadId(null);
    setMessages([]);
    setError("");
    void loadThreads();
  }, [loadThreads]);

  const openThread = useCallback(
    async (threadId: string) => {
      if (!base) return;
      setActiveThreadId(threadId);
      setMessages([]);
      setLoadingMessages(true);
      setError("");
      try {
        const res = await fetch(`${base}/${threadId}`);
        if (!res.ok) throw new Error("No se pudo cargar el hilo");
        const data: ThreadDetail = await res.json();
        setMessages(data.messages ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        setLoadingMessages(false);
      }
    },
    [base]
  );

  function newThread() {
    setActiveThreadId(null);
    setMessages([]);
    setError("");
  }

  const deleteThread = useCallback(
    async (threadId: string) => {
      if (!base) return;
      try {
        const res = await fetch(`${base}/${threadId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("No se pudo borrar el hilo");
        if (activeThreadId === threadId) newThread();
        await loadThreads();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al borrar");
      }
    },
    [base, activeThreadId, loadThreads]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!base || !trimmed || sending) return;
      const userMsg: Message = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setSending(true);
      setError("");
      const sendThreadId = activeThreadId;
      try {
        const res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, threadId: sendThreadId ?? undefined }),
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
        setMessages((prev) => prev.filter((m) => m !== userMsg));
      } finally {
        setSending(false);
      }
    },
    [base, activeThreadId, sending, loadThreads]
  );

  return {
    threads,
    activeThreadId,
    messages,
    loadingThreads,
    loadingMessages,
    sending,
    error,
    loadThreads,
    openThread,
    newThread,
    deleteThread,
    sendMessage,
  };
}
