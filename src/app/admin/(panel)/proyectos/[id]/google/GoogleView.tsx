"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as Select from "@radix-ui/react-select";
import { Loader2, ChevronDown, Check } from "lucide-react";
import GscPanel from "@/components/admin/GscPanel";

type GscSite = { siteUrl: string; permissionLevel: string };
type Ga4Property = { propertyId: string; displayName: string; accountName: string };
type Propiedades = { gscSites: GscSite[]; ga4Properties: Ga4Property[] };

type SourceResult<T> = T | { error: string } | null;
type GscTotals = { clicks: number; impressions: number; ctr: number; position: number };
type Ga4Totals = { sessions: number; conversions: number };
type Dashboard = { gsc: SourceResult<GscTotals>; ga4: SourceResult<Ga4Totals> };

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

export default function GoogleView({
  projectId,
  initialGscSiteUrl,
  initialGa4PropertyId,
}: {
  projectId: string;
  initialGscSiteUrl: string | null;
  initialGa4PropertyId: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [propiedades, setPropiedades] = useState<Propiedades | null>(null);

  const [gscSiteUrl, setGscSiteUrl] = useState(initialGscSiteUrl ?? "");
  const [ga4PropertyId, setGa4PropertyId] = useState(initialGa4PropertyId ?? "");
  // Propiedad de GSC ya persistida: el panel detallado de Search Console se
  // monta sobre el valor guardado (no sobre la selección sin guardar) y se
  // refresca al guardar una nueva.
  const [savedGsc, setSavedGsc] = useState(initialGscSiteUrl);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(
    Boolean(initialGscSiteUrl || initialGa4PropertyId)
  );

  useEffect(() => {
    fetch("/api/google/propiedades")
      .then(async (r) => {
        if (r.status === 409) {
          setNotConnected(true);
          return null;
        }
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error ?? "Error al cargar las propiedades de Google");
        }
        return r.json();
      })
      .then((data) => {
        if (data) setPropiedades(data);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!initialGscSiteUrl && !initialGa4PropertyId) return;
    fetch(`/api/proyectos/${projectId}/google/dashboard`)
      .then((r) => r.json())
      .then((data) => setDashboard(data))
      .finally(() => setLoadingDashboard(false));
  }, [projectId, initialGscSiteUrl, initialGa4PropertyId]);

  async function handleSave() {
    setSaveError("");
    setSaving(true);
    const res = await fetch(`/api/proyectos/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gscSiteUrl, ga4PropertyId }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setSaveError(data.error ?? "Error al guardar");
      return;
    }
    setSaveError("");
    setSavedGsc(gscSiteUrl || null);
    setLoadingDashboard(true);
    fetch(`/api/proyectos/${projectId}/google/dashboard`)
      .then((r) => r.json())
      .then((d) => setDashboard(d))
      .finally(() => setLoadingDashboard(false));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (notConnected) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-sm text-gray-600">
          Todavía no hay ninguna cuenta de Google conectada.{" "}
          <Link href="/admin/configuracion" className="text-gray-900 font-medium underline">
            Conectar en Configuración →
          </Link>
        </p>
      </div>
    );
  }

  if (loadError) {
    return <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{loadError}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Integraciones Google</h2>
        <p className="text-sm text-gray-500 mt-1">
          Elige la propiedad de Search Console y de GA4 de este proyecto.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Search Console</label>
          <Select.Root value={gscSiteUrl || undefined} onValueChange={setGscSiteUrl}>
            <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
              <Select.Value placeholder="Sin seleccionar" />
              <Select.Icon>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                <Select.Viewport>
                  {(propiedades?.gscSites ?? []).map((site) => (
                    <Select.Item
                      key={site.siteUrl}
                      value={site.siteUrl}
                      className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100 flex items-center gap-2"
                    >
                      <Select.ItemText>{site.siteUrl}</Select.ItemText>
                      <Select.ItemIndicator>
                        <Check className="h-3.5 w-3.5" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Google Analytics (GA4)</label>
          <Select.Root value={ga4PropertyId || undefined} onValueChange={setGa4PropertyId}>
            <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
              <Select.Value placeholder="Sin seleccionar" />
              <Select.Icon>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                <Select.Viewport>
                  {(propiedades?.ga4Properties ?? []).map((prop) => (
                    <Select.Item
                      key={prop.propertyId}
                      value={prop.propertyId}
                      className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100 flex items-center gap-2"
                    >
                      <Select.ItemText>
                        {prop.accountName} — {prop.displayName}
                      </Select.ItemText>
                      <Select.ItemIndicator>
                        <Check className="h-3.5 w-3.5" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        <div className="space-y-1 opacity-50">
          <label className="block text-sm font-medium text-gray-700">Business Profile</label>
          <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400 cursor-not-allowed">
            Pendiente de aprobación de Google (requiere solicitud manual de acceso a la API)
          </div>
        </div>

        {saveError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar
        </button>
      </div>

      {loadingDashboard && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}

      {dashboard && (
        // grid-cols-2 fijo (no sm:grid-cols-4): el nº de tiles es dinámico
        // (2 si solo hay GSC o GA4, 4 si hay ambos, + banners de error a ancho
        // completo). Así nunca quedan celdas vacías sea cual sea la combinación.
        <div className="grid grid-cols-2 gap-4">
          {dashboard.gsc && "error" in dashboard.gsc ? (
            <div className="col-span-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              Search Console: {dashboard.gsc.error}
            </div>
          ) : dashboard.gsc ? (
            <>
              <StatTile label="Clics (28 días)" value={String(dashboard.gsc.clicks)} />
              <StatTile label="Impresiones (28 días)" value={String(dashboard.gsc.impressions)} />
            </>
          ) : null}

          {dashboard.ga4 && "error" in dashboard.ga4 ? (
            <div className="col-span-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              Google Analytics: {dashboard.ga4.error}
            </div>
          ) : dashboard.ga4 ? (
            <>
              <StatTile label="Sesiones (28 días)" value={String(dashboard.ga4.sessions)} />
              <StatTile label="Conversiones (28 días)" value={String(dashboard.ga4.conversions)} />
            </>
          ) : null}
        </div>
      )}

      {savedGsc && <GscPanel key={savedGsc} projectId={projectId} />}
    </div>
  );
}
