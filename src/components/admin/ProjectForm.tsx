"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { slugify, cn } from "@/lib/utils";
import GbpPicker, { type GbpCandidate } from "@/components/admin/GbpPicker";

export type ProjectFormValues = {
  name: string;
  slug: string;
  domain: string;
  isLocalBusiness: boolean;
  businessName: string;
  address: string;
  phone: string;
  hours: string;
  lat: string;
  lng: string;
  gbpName: string;
  gbpPlaceId: string;
  spendLimitUsd: string;
  toneOfVoice: string;
  notes: string;
};

const EMPTY_VALUES: ProjectFormValues = {
  name: "",
  slug: "",
  domain: "",
  isLocalBusiness: false,
  businessName: "",
  address: "",
  phone: "",
  hours: "",
  lat: "",
  lng: "",
  gbpName: "",
  gbpPlaceId: "",
  spendLimitUsd: "",
  toneOfVoice: "",
  notes: "",
};

export default function ProjectForm({
  initial,
  submitLabel,
  showSlug = true,
  projectId,
  onSubmit,
}: {
  initial?: Partial<ProjectFormValues>;
  submitLabel: string;
  showSlug?: boolean;
  // ProjectForm solo se usa hoy en edición (proyecto ya existente), así que
  // projectId siempre llega — opcional únicamente por si en el futuro se
  // reutiliza en un flujo de creación sin id todavía.
  projectId?: string;
  onSubmit: (values: ProjectFormValues) => Promise<string | void>;
}) {
  const [form, setForm] = useState<ProjectFormValues>({ ...EMPTY_VALUES, ...initial });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Marca si el usuario ha editado el slug a mano. Mientras no, el slug se
  // deriva automáticamente del nombre (autorelleno que sigue al nombre).
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  // "Avanzado" oculto por defecto: dirección/coordenadas manuales, solo para
  // el caso de un negocio que no aparece en Google Maps — el buscador de
  // ficha es el mecanismo principal de relleno.
  const [showAdvanced, setShowAdvanced] = useState(false);

  function applyGbpCandidate(c: GbpCandidate) {
    setForm((prev) => ({
      ...prev,
      businessName: c.title,
      gbpName: c.title,
      gbpPlaceId: c.placeId,
      lat: c.lat != null ? String(c.lat) : prev.lat,
      lng: c.lng != null ? String(c.lng) : prev.lng,
      address: c.address ?? prev.address,
    }));
  }

  function set<K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const errorMessage = await onSubmit(form);
    setSubmitting(false);
    if (errorMessage) setError(errorMessage);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Datos generales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Nombre del proyecto</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  name,
                  // Mientras el usuario no haya tocado el slug, se deriva del
                  // nombre en cada pulsación (autorelleno).
                  slug: slugTouched ? prev.slug : slugify(name),
                }));
              }}
              placeholder="Autocaravanas Ruta Norte"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              required
            />
          </div>
          {showSlug && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Identificador (slug)</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value);
                }}
                placeholder="autocaravanas-ruta-norte"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 font-mono"
                required
              />
            </div>
          )}
          <div className="space-y-1 sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Dominio</label>
            <input
              type="text"
              value={form.domain}
              onChange={(e) => set("domain", e.target.value)}
              placeholder="www.ejemplo.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Tope de gasto mensual (USD) <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.spendLimitUsd}
              onChange={(e) => set("spendLimitUsd", e.target.value)}
              placeholder="5"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
            />
          </div>
          <p className="text-xs text-gray-400 sm:col-span-1 self-end">
            Bloquea las llamadas a DataForSEO de este proyecto al superarlo (se suma al tope global).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Negocio local (NAP)</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.isLocalBusiness}
              onChange={(e) => set("isLocalBusiness", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Es un negocio local
          </label>
        </div>
        {form.isLocalBusiness && (
          <div className="space-y-4">
            {projectId && (
              <GbpPicker
                projectId={projectId}
                currentGbpName={form.gbpName || null}
                currentPlaceId={form.gbpPlaceId || null}
                onApplied={applyGbpCandidate}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Horario</label>
                <input
                  type="text"
                  value={form.hours}
                  onChange={(e) => set("hours", e.target.value)}
                  placeholder="Lunes a viernes 9:00-14:00 y 16:00-19:00"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")} />
              Avanzado: introducir dirección/coordenadas a mano
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Nombre del negocio</label>
                  <input
                    type="text"
                    value={form.businessName}
                    onChange={(e) => set("businessName", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Dirección</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Latitud <span className="text-gray-400 font-normal">(centro del geogrid)</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={form.lat}
                    onChange={(e) => set("lat", e.target.value)}
                    placeholder="40.4168"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Longitud <span className="text-gray-400 font-normal">(centro del geogrid)</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={form.lng}
                    onChange={(e) => set("lng", e.target.value)}
                    placeholder="-3.7038"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
                  />
                </div>
                <p className="text-xs text-gray-400 sm:col-span-2">
                  Solo necesario si el negocio no aparece en el buscador de arriba (ej. ficha de Google
                  todavía no creada). Obtén las coordenadas exactas en Google Maps: clic derecho en el
                  pin → copiar.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Perfil de marca</h2>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Tono de voz</label>
          <textarea
            value={form.toneOfVoice}
            onChange={(e) => set("toneOfVoice", e.target.value)}
            rows={2}
            placeholder="Cercano, directo, sin tecnicismos..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Notas internas</label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </button>
    </form>
  );
}
