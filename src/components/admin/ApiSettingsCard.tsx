"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, KeyRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SETTINGS_CATALOG, type SettingKey } from "@/lib/settings-catalog";

type Status = { configured: boolean; source: "db" | "env" | "none" };
type StatusMap = Record<SettingKey, Status>;

// Todos los ajustes se comportan igual una vez guardados: el valor real
// nunca vuelve del servidor, solo si está configurado y de dónde (BD o
// .env) — el campo se queda vacío con un placeholder de puntos, listo para
// escribir un valor nuevo que sustituya al anterior en cualquier momento.
function SettingField({
  settingKey,
  label,
  placeholder,
  helpText,
  status,
  onSaved,
}: {
  settingKey: SettingKey;
  label: string;
  placeholder?: string;
  helpText?: string;
  status: Status;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/configuracion/ajustes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: settingKey, value }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Error al guardar");
      return;
    }
    setValue("");
    onSaved();
  }

  async function handleClear() {
    setClearing(true);
    setError("");
    const res = await fetch(`/api/configuracion/ajustes?key=${settingKey}`, { method: "DELETE" });
    setClearing(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Error al quitar");
      return;
    }
    onSaved();
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-gray-600">{label}</label>
        {status.configured ? (
          <span className="flex items-center gap-1 text-[10px] text-emerald-600 shrink-0">
            <CheckCircle2 className="h-3 w-3" />
            Configurado{status.source === "env" ? " (.env)" : ""}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-gray-400 shrink-0">
            <Circle className="h-3 w-3" />
            Sin configurar
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status.configured ? "•••••••••••• (déjalo vacío para no cambiarlo)" : placeholder}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 font-mono"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className="px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 shrink-0"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
        </button>
        {status.source === "db" && (
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="p-2 text-gray-300 hover:text-red-600 shrink-0"
            title="Quitar el valor guardado (vuelve al .env si existe)"
          >
            {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-4 w-4" />}
          </button>
        )}
      </div>
      {helpText && <p className="text-[11px] text-gray-400">{helpText}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ApiSettingsCard() {
  const [status, setStatus] = useState<StatusMap | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    return fetch("/api/configuracion/ajustes")
      .then((r) => r.json())
      .then((d: StatusMap) => {
        if (d) setStatus(d);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const groups = Array.from(new Set(SETTINGS_CATALOG.map((s) => s.group)));

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-gray-500" />
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Claves de API</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Se guardan cifradas en la base de datos y sustituyen a las del <code>.env</code> — puedes
            cambiarlas en cualquier momento sin tocar el servidor. Una vez guardado, el valor no vuelve
            a mostrarse: solo si está configurado y desde dónde.
          </p>
        </div>
      </div>

      {loading || !status ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : (
        <div className={cn("grid gap-6", "sm:grid-cols-2")}>
          {groups.map((group) => (
            <div key={group} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{group}</h3>
              <div className="space-y-3">
                {SETTINGS_CATALOG.filter((s) => s.group === group).map((s) => (
                  <SettingField
                    key={s.key}
                    settingKey={s.key}
                    label={s.label}
                    placeholder={s.placeholder}
                    helpText={s.helpText}
                    status={status[s.key]}
                    onSaved={load}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
