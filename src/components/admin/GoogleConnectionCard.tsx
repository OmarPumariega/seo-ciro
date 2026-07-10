"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const SCOPE_LABELS: Record<string, string> = {
  "https://www.googleapis.com/auth/webmasters.readonly": "Search Console (solo lectura)",
  "https://www.googleapis.com/auth/analytics.readonly": "Google Analytics (solo lectura)",
  "https://www.googleapis.com/auth/userinfo.email": "Email de la cuenta",
};

type Connection = { googleEmail: string; scope: string; connectedAt: Date } | null;

export default function GoogleConnectionCard({
  connection,
  justConnected,
  errorMessage,
}: {
  connection: Connection;
  justConnected: boolean;
  errorMessage: string | null;
}) {
  const router = useRouter();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    await fetch("/api/google/oauth", { method: "DELETE" });
    setDisconnecting(false);
    setConfirmingDisconnect(false);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      {justConnected && (
        <div className="flex items-center gap-2 text-sm bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg">
          <CheckCircle2 className="h-4 w-4" />
          Conectado correctamente.
        </div>
      )}
      {errorMessage && (
        <div className="flex items-center gap-2 text-sm bg-red-50 text-red-600 px-3 py-2 rounded-lg">
          <AlertTriangle className="h-4 w-4" />
          {errorMessage}
        </div>
      )}

      {connection ? (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-500">Conectado como</p>
            <p className="text-base font-medium text-gray-900">{connection.googleEmail}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Permisos concedidos</p>
            <ul className="text-sm text-gray-700 list-disc list-inside">
              {connection.scope.split(" ").filter(Boolean).map((scope) => (
                <li key={scope}>{SCOPE_LABELS[scope] ?? scope}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-gray-400">
            Conectado desde {new Date(connection.connectedAt).toLocaleString("es-ES")}
          </p>

          {!confirmingDisconnect ? (
            <button
              onClick={() => setConfirmingDisconnect(true)}
              className="text-sm text-gray-400 hover:text-red-600"
            >
              Desconectar
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">¿Seguro que quieres desconectar?</span>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {disconnecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Sí, desconectar
              </button>
              <button
                onClick={() => setConfirmingDisconnect(false)}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Todavía no hay ninguna cuenta de Google conectada.
          </p>
          <a
            href="/api/google/oauth/authorize"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
          >
            Conectar con Google
          </a>
        </div>
      )}
    </div>
  );
}
