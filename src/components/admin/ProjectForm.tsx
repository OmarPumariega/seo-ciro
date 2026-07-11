"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { slugify } from "@/lib/utils";

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
  onSubmit,
}: {
  initial?: Partial<ProjectFormValues>;
  submitLabel: string;
  showSlug?: boolean;
  onSubmit: (values: ProjectFormValues) => Promise<string | void>;
}) {
  const [form, setForm] = useState<ProjectFormValues>({ ...EMPTY_VALUES, ...initial });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Marca si el usuario ha editado el slug a mano. Mientras no, el slug se
  // deriva automáticamente del nombre (autorelleno que sigue al nombre).
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Nombre del negocio</label>
              <input
                type="text"
                value={form.businessName}
                onChange={(e) => set("businessName", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Teléfono</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
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
              Obtén las coordenadas exactas en Google Maps: clic derecho en el pin → copiar. Necesarias
              para el geogrid del Módulo 9.
            </p>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Ficha Google Business Profile <span className="text-gray-400 font-normal">(nombre tal cual aparece en Google Maps)</span>
              </label>
              <input
                type="text"
                value={form.gbpName}
                onChange={(e) => set("gbpName", e.target.value)}
                placeholder="Pastelería La Mallorquina - Sol"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              />
              <p className="text-xs text-gray-400">
                Pega el nombre EXACTO de tu ficha de Google. El geogrid lo usa para localizar tu negocio
                en los resultados de Maps. (Opcional pero recomendado para precisión.)
              </p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Place ID de Google <span className="text-gray-400 font-normal">(opcional, matching exacto)</span>
              </label>
              <input
                type="text"
                value={form.gbpPlaceId}
                onChange={(e) => set("gbpPlaceId", e.target.value)}
                placeholder="ChIJ..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 font-mono"
              />
              <p className="text-xs text-gray-400">
                Si lo conoces, pégalo para un matching 1:1 en el geogrid. Encuéntralo en
                developers.google.com/maps/documentation/places/web-service/place-id.
              </p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Horario</label>
              <textarea
                value={form.hours}
                onChange={(e) => set("hours", e.target.value)}
                rows={2}
                placeholder="Lunes a viernes 9:00-14:00 y 16:00-19:00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400"
              />
            </div>
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
