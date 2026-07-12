// Catálogo de ajustes configurables desde /admin/configuracion — sin
// dependencias de servidor (Prisma, crypto), para poder importarse tal cual
// desde un componente cliente. La lógica de lectura/escritura cifrada vive en
// src/lib/settings.ts, que reexporta este catálogo.

export type SettingKey =
  | "OPENROUTER_API_KEY"
  | "OPENROUTER_MODEL"
  | "DATAFORSEO_LOGIN"
  | "DATAFORSEO_PASSWORD"
  | "DATAFORSEO_MONTHLY_LIMIT_USD"
  | "PAGESPEED_API_KEY"
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_USER"
  | "SMTP_PASS"
  | "ALERT_FROM"
  | "ALERT_TO";

export type SettingMeta = {
  key: SettingKey;
  label: string;
  group: string;
  placeholder?: string;
  helpText?: string;
};

// Orden = orden de aparición en la UI, agrupado por tarjeta.
export const SETTINGS_CATALOG: SettingMeta[] = [
  {
    key: "OPENROUTER_API_KEY",
    label: "API Key",
    group: "OpenRouter (IA)",
    helpText: "Usada por Título/Meta, Schema, Contenido, Estructura de URLs y Copilot.",
  },
  {
    key: "OPENROUTER_MODEL",
    label: "Modelo por defecto",
    group: "OpenRouter (IA)",
    placeholder: "openai/gpt-4o-mini",
  },
  { key: "DATAFORSEO_LOGIN", label: "Usuario (login)", group: "DataForSEO" },
  { key: "DATAFORSEO_PASSWORD", label: "Contraseña", group: "DataForSEO" },
  {
    key: "DATAFORSEO_MONTHLY_LIMIT_USD",
    label: "Tope de gasto mensual (USD)",
    group: "DataForSEO",
    placeholder: "10",
    helpText: "Vacío = sin tope (uso ilimitado).",
  },
  {
    key: "PAGESPEED_API_KEY",
    label: "API Key",
    group: "Google PageSpeed Insights",
    helpText: "Usada solo sobre la home del proyecto en cada Auditoría técnica.",
  },
  { key: "SMTP_HOST", label: "Host SMTP", group: "Avisos por email" },
  { key: "SMTP_PORT", label: "Puerto", group: "Avisos por email", placeholder: "587" },
  { key: "SMTP_USER", label: "Usuario SMTP", group: "Avisos por email" },
  { key: "SMTP_PASS", label: "Contraseña SMTP", group: "Avisos por email" },
  {
    key: "ALERT_FROM",
    label: "Remitente",
    group: "Avisos por email",
    placeholder: "SEO Ciro <alertas@agenciaciro.com>",
  },
  {
    key: "ALERT_TO",
    label: "Destinatario de avisos",
    group: "Avisos por email",
    helpText: "Auditoría completada/fallida, caídas de posición ≥10, tope de gasto cercano.",
  },
];

export const SETTINGS_KEYS = new Set<string>(SETTINGS_CATALOG.map((s) => s.key));
