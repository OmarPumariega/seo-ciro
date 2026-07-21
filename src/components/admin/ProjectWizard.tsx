"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as Select from "@radix-ui/react-select";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/utils";
import Stepper, { type StepDescriptor } from "@/components/admin/Stepper";
import LocationPicker, { type LocationValue } from "@/components/admin/LocationPicker";
import GbpPicker from "@/components/admin/GbpPicker";

// Wizard de alta de proyecto en 6 pasos. El proyecto se crea en el paso 1
// (mínimo name + domain recomendado) y los siguientes lo enriquecen vía
// PATCH/POST a su id. Todos los pasos salvo el núcleo del 1 son omitibles.
// Reutiliza los endpoints existentes sin tocarlos.

const STEPS: StepDescriptor[] = [
  { title: "Datos del proyecto" },
  { title: "Negocio local", optional: true },
  { title: "Google", optional: true },
  { title: "Keywords", optional: true },
  { title: "Competidores", optional: true },
  { title: "Lanzar" },
];

const INPUT =
  "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400";
const LABEL = "block text-sm font-medium text-gray-700";

type GscSite = { siteUrl: string; permissionLevel: string };
type Ga4Property = { propertyId: string; displayName: string; accountName: string };

export default function ProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  // Estado "completado/omitido" de cada paso, para el resumen final.
  const [stepStatus, setStepStatus] = useState<("pending" | "done" | "skipped")[]>(
    STEPS.map(() => "pending")
  );

  // --- Paso 1: datos básicos ---
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [domain, setDomain] = useState("");
  const [spendLimit, setSpendLimit] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState("");
  const [notes, setNotes] = useState("");

  // --- Paso 2: negocio local ---
  const [isLocalBusiness, setIsLocalBusiness] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [gbpName, setGbpName] = useState("");
  const [gbpPlaceId, setGbpPlaceId] = useState("");

  // --- Paso 3: Google ---
  const [propLoading, setPropLoading] = useState(false);
  const [propNotConnected, setPropNotConnected] = useState(false);
  const [gscSites, setGscSites] = useState<GscSite[]>([]);
  const [ga4Properties, setGa4Properties] = useState<Ga4Property[]>([]);
  const [gscSiteUrl, setGscSiteUrl] = useState("");
  const [ga4PropertyId, setGa4PropertyId] = useState("");

  // --- Paso 4: keywords ---
  const [studyName, setStudyName] = useState("");
  const [seedKeywords, setSeedKeywords] = useState("");
  const [location, setLocation] = useState<LocationValue>(null);

  // --- Paso 5: competidores ---
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [addDomain, setAddDomain] = useState("");

  // --- Paso 6: lanzar ---
  const [runAudit, setRunAudit] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const effectiveSlug = slugTouched ? slug : slugify(name);

  function markStatus(index: number, status: "done" | "skipped") {
    setStepStatus((prev) => prev.map((s, i) => (i === index ? status : s)));
  }

  // Carga propiedades de Google al entrar en el paso 3. El spinner se activa en
  // gotoStep (al navegar hacia aquí), no aquí dentro, para no hacer setState
  // síncrono dentro del effect.
  useEffect(() => {
    if (step !== 2 || projectId === null) return;
    fetch("/api/google/propiedades")
      .then(async (r) => {
        if (r.status === 409) {
          setPropNotConnected(true);
          return null;
        }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (data) {
          setGscSites(data.gscSites ?? []);
          setGa4Properties(data.ga4Properties ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setPropLoading(false));
  }, [step, projectId]);

  function gotoStep(i: number) {
    setError("");
    if (i === 2) {
      setPropLoading(true);
      setPropNotConnected(false);
    }
    setStep(i);
  }

  async function patchProject(fields: Record<string, unknown>): Promise<boolean> {
    if (!projectId) return false;
    const res = await fetch(`/api/proyectos/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    return res.ok;
  }

  // --- Acción "Continuar" por paso ---
  async function handleContinue(): Promise<boolean> {
    setError("");
    setSaving(true);
    try {
      if (step === 0) {
        // Crear (o actualizar si ya existe).
        const body = {
          name,
          slug: effectiveSlug,
          domain,
          spendLimitUsd: spendLimit,
          toneOfVoice,
          notes,
        };
        if (projectId) {
          await patchProject(body);
        } else {
          const res = await fetch("/api/proyectos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error ?? "Error al crear el proyecto");
            return false;
          }
          setProjectId(data.id);
        }
      } else if (step === 1) {
        await patchProject({
          isLocalBusiness,
          businessName,
          address,
          phone,
          hours,
          lat,
          lng,
          gbpName,
          gbpPlaceId,
        });
      } else if (step === 2) {
        await patchProject({ gscSiteUrl, ga4PropertyId });
      } else if (step === 3) {
        const res = await fetch(`/api/proyectos/${projectId}/keywords/estudios`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: studyName || undefined,
            keywords: seedKeywords || undefined,
            locationCode: location?.code,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          // No bloquea el wizard: avisa y sigue.
          setError(d.error ?? "No se pudo crear el estudio de keywords (puedes continuar).");
        }
      } else if (step === 4) {
        await Promise.all(
          competitors
            .filter(Boolean)
            .map((d) =>
              fetch(`/api/proyectos/${projectId}/competidores`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domain: d }),
              }).catch(() => {})
            )
        );
      }
      markStatus(step, "done");
      return true;
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    const ok = await handleContinue();
    if (ok) gotoStep(Math.min(step + 1, STEPS.length - 1));
  }

  function skip() {
    markStatus(step, "skipped");
    gotoStep(Math.min(step + 1, STEPS.length - 1));
  }

  function back() {
    gotoStep(Math.max(step - 1, 0));
  }

  async function finish() {
    if (projectId) {
      // Lanzamiento completo en background: importa las keywords del estudio
      // al rank tracking y las chequea (lo que dispara TF-IDF gratis), y
      // analiza visibilidad + content gap de cada competidor. Fire-and-forget
      // igual que la auditoría: no bloquea la navegación a la ficha.
      await fetch(`/api/proyectos/${projectId}/bootstrap`, { method: "POST" }).catch(() => {});
      if (runAudit) {
        await fetch(`/api/proyectos/${projectId}/auditorias`, { method: "POST" }).catch(() => {});
      }
      router.push(`/admin/proyectos/${projectId}`);
    } else {
      router.push("/admin/proyectos");
    }
  }

  function addCompetitor() {
    const d = addDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (d && !competitors.includes(d)) setCompetitors((prev) => [...prev, d]);
    setAddDomain("");
  }

  const isLast = step === STEPS.length - 1;
  const canContinueStep0 = name.trim().length > 0;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/proyectos"
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Proyectos
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Nuevo proyecto</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configura el proyecto paso a paso. Los opcionales puedes omitirlos y completarlos después.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-6">
        <Stepper steps={STEPS} current={step} onStepClick={(i) => gotoStep(i)} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 sm:p-6 space-y-4">
        {/* PASO 1 */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={LABEL}>Nombre del proyecto *</label>
                <input
                  className={INPUT}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Pumariega"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className={LABEL}>Identificador (slug)</label>
                <input
                  className={cn(INPUT, "font-mono")}
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugTouched(true);
                  }}
                  placeholder="pumariega"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className={LABEL}>Dominio *</label>
              <input
                className={INPUT}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="pumariega.com (sin https://)"
              />
              <p className="text-xs text-gray-400">
                Necesario para rastrear el sitio (auditoría, geogrid, etc.). Puedes omitirlo y
                añadirlo luego, pero sin él la auditoría no puede lanzarse.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={LABEL}>Tope de gasto mensual (USD, opcional)</label>
                <input
                  className={INPUT}
                  value={spendLimit}
                  onChange={(e) => setSpendLimit(e.target.value)}
                  placeholder="Vacío = sin tope"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1">
                <label className={LABEL}>Tono de voz (opcional)</label>
                <input
                  className={INPUT}
                  value={toneOfVoice}
                  onChange={(e) => setToneOfVoice(e.target.value)}
                  placeholder="Profesional, cercero, técnico…"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className={LABEL}>Notas internas (opcional)</label>
              <textarea
                className={INPUT}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Contexto del cliente, objetivos…"
              />
            </div>
          </div>
        )}

        {/* PASO 2 */}
        {step === 1 && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isLocalBusiness}
                onChange={(e) => setIsLocalBusiness(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-gray-700">
                Es un negocio local con ubicación física (activa SEO local / geogrid)
              </span>
            </label>
            {isLocalBusiness && (
              <>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={LABEL}>Nombre del negocio</label>
                    <input className={INPUT} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className={LABEL}>Teléfono</label>
                    <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={LABEL}>Dirección</label>
                  <input className={INPUT} value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className={LABEL}>Horario (texto libre)</label>
                  <input className={INPUT} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="L-V 9:00-20:00, S 10:00-14:00" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={LABEL}>Latitud</label>
                    <input className={INPUT} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="43.3623" />
                  </div>
                  <div className="space-y-1">
                    <label className={LABEL}>Longitud</label>
                    <input className={INPUT} value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" placeholder="-5.8486" />
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Las coordenadas son necesarias para el geogrid (mapa de calor de posicionamiento local).
                  Si buscas tu ficha abajo, se rellenarán solas.
                </p>
                {projectId && (
                  <div className="space-y-2">
                    <label className={LABEL}>Ficha de Google Business Profile</label>
                    <GbpPicker
                      projectId={projectId}
                      currentGbpName={gbpName || null}
                      currentPlaceId={gbpPlaceId || null}
                      onApplied={(c) => {
                        setGbpName(c.title);
                        setGbpPlaceId(c.placeId);
                        if (c.lat != null) setLat(String(c.lat));
                        if (c.lng != null) setLng(String(c.lng));
                        if (c.address) setAddress(c.address);
                      }}
                    />
                    <p className="text-xs text-gray-400">
                      Busca tu negocio por nombre y selecciónalo: rellena automáticamente el nombre,
                      el Place ID y las coordenadas. La conexión automática con GBP está pendiente de
                      aprobación de Google; estos datos mejoran el matching del geogrid.
                    </p>
                  </div>
                )}
              </>
            )}
            {!isLocalBusiness && (
              <p className="text-sm text-gray-500">
                Si no es un negocio local, omite este paso. Podrás activarlo más tarde desde la ficha
                del proyecto.
              </p>
            )}
          </div>
        )}

        {/* PASO 3 */}
        {step === 2 && (
          <div className="space-y-4">
            {propLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : propNotConnected ? (
              <div className="text-sm text-gray-600 space-y-2">
                <p>Todavía no hay ninguna cuenta de Google conectada.</p>
                <Link href="/admin/configuracion" className="text-gray-900 font-medium underline">
                  Conéctala en Configuración →
                </Link>
                <p className="text-xs text-gray-400">
                  Puedes omitir este paso y conectar Search Console / Analytics más tarde.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className={LABEL}>Search Console</label>
                  <Select.Root value={gscSiteUrl || undefined} onValueChange={setGscSiteUrl}>
                    <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
                      <Select.Value placeholder="Sin seleccionar" />
                      <Select.Icon><ChevronDown className="h-4 w-4 text-gray-400" /></Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                        <Select.Viewport>
                          {gscSites.map((s) => (
                            <Select.Item key={s.siteUrl} value={s.siteUrl} className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100">
                              <Select.ItemText>{s.siteUrl}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
                <div className="space-y-1">
                  <label className={LABEL}>Google Analytics (GA4)</label>
                  <Select.Root value={ga4PropertyId || undefined} onValueChange={setGa4PropertyId}>
                    <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-gray-400 bg-white">
                      <Select.Value placeholder="Sin seleccionar" />
                      <Select.Icon><ChevronDown className="h-4 w-4 text-gray-400" /></Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                        <Select.Viewport>
                          {ga4Properties.map((p) => (
                            <Select.Item key={p.propertyId} value={p.propertyId} className="px-3 py-2 text-sm text-gray-900 outline-none cursor-pointer data-[highlighted]:bg-gray-100">
                              <Select.ItemText>{p.accountName} — {p.displayName}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
              </>
            )}
          </div>
        )}

        {/* PASO 4 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className={LABEL}>Nombre del estudio (opcional)</label>
              <input
                className={INPUT}
                value={studyName}
                onChange={(e) => setStudyName(e.target.value)}
                placeholder={`Estudio inicial — ${new Date().toLocaleDateString("es-ES")}`}
              />
            </div>
            <div className="space-y-1">
              <label className={LABEL}>Keywords semilla (una por línea, opcional)</label>
              <textarea
                className={cn(INPUT, "resize-y")}
                rows={4}
                value={seedKeywords}
                onChange={(e) => setSeedKeywords(e.target.value)}
                placeholder={"barbería Gijón\ncorte de pelo hombre\narreglo de barba"}
              />
              <p className="text-xs text-gray-400">
                Si dejas vacío, se crea un estudio en blanco (gratis) que rellenarás después. Con
                semillas se resuelve volumen e intención vía DataForSEO.
              </p>
              <p className="text-xs text-gray-500">
                Al lanzar el proyecto, estas keywords se importarán automáticamente al Rank Tracking
                y se chequeará su posición real en Google (lo que también alimentará el módulo
                TF-IDF sin coste adicional).
              </p>
            </div>
            <div className="space-y-1">
              <label className={LABEL}>Ubicación de la búsqueda (opcional)</label>
              <LocationPicker value={location} onChange={setLocation} />
            </div>
          </div>
        )}

        {/* PASO 5 */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Añade los dominios competidores. Al lanzar el proyecto se analizarán automáticamente
              (visibilidad real + top keywords + content gap frente a tu dominio).
            </p>
            <div className="flex gap-2">
              <input
                className={INPUT}
                value={addDomain}
                onChange={(e) => setAddDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCompetitor())}
                placeholder="competidor.com"
              />
              <button
                type="button"
                onClick={addCompetitor}
                className="px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 shrink-0 inline-flex items-center gap-1"
              >
                <Plus className="h-4 w-4" /> Añadir
              </button>
            </div>
            {competitors.length > 0 && (
              <ul className="space-y-1.5">
                {competitors.map((d) => (
                  <li key={d} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700 truncate">{d}</span>
                    <button
                      type="button"
                      onClick={() => setCompetitors((prev) => prev.filter((x) => x !== d))}
                      className="text-gray-400 hover:text-red-600 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* PASO 6 */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Resumen</p>
              <ul className="space-y-1.5 text-sm">
                {STEPS.slice(0, 5).map((s, i) => (
                  <li key={s.title} className="flex items-center gap-2">
                    {stepStatus[i] === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <span className="h-4 w-4 flex items-center justify-center text-gray-300 shrink-0">–</span>
                    )}
                    <span className={stepStatus[i] === "done" ? "text-gray-900" : "text-gray-400"}>
                      {s.title}
                      {stepStatus[i] === "skipped" && " (omitido)"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1">
              <p className="font-medium text-gray-700">Al pulsar “Crear y lanzar” se ejecutará en segundo plano:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Importar las keywords del estudio al Rank Tracking y comprobar su posición.</li>
                <li>Generar el análisis TF-IDF de cada keyword (gratis, reutiliza el SERP ya pagado).</li>
                <li>Analizar cada competidor (visibilidad + content gap).</li>
              </ul>
              <p className="text-gray-500">
                El coste real se registra en el panel de Costes. Puedes ver el progreso al entrar en
                la ficha del proyecto.
              </p>
            </div>
            <label className="flex items-start gap-2 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={runAudit}
                onChange={(e) => setRunAudit(e.target.checked)}
                className="h-4 w-4 mt-0.5"
              />
              <span>
                <span className="text-sm font-medium text-gray-900">Ejecutar auditoría técnica ahora</span>
                <span className="block text-xs text-gray-500">
                  Rastrea el sitio (enlaces rotos, HTTPS, canonicals, on-page…). Requiere dominio.
                </span>
              </span>
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        {/* Navegación */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
          {step === 0 ? (
            <Link href="/admin/proyectos" className="text-sm text-gray-500 hover:text-gray-900 inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> Cancelar
            </Link>
          ) : (
            <button type="button" onClick={back} className="text-sm text-gray-500 hover:text-gray-900 inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> Atrás
            </button>
          )}

          <div className="flex items-center gap-2">
            {step > 0 && !isLast && (
              <button type="button" onClick={skip} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900">
                Omitir paso
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={goNext}
                disabled={saving || (step === 0 && !canContinueStep0)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Continuar <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Crear y lanzar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
