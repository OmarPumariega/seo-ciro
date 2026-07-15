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
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "GOOGLE_REDIRECT_URI"
  | "COPILOT_MODEL"
  | "COPILOT_SYSTEM_PROMPT"
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
  multiline?: boolean; // textarea (para prompts largos)
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
  {
    key: "COPILOT_MODEL",
    label: "Modelo del Copilot",
    group: "Copilot",
    placeholder: "openai/gpt-4o-mini",
    helpText: "Vacío = usa el modelo por defecto de la herramienta. Puedes poner uno más conversacional (p.ej. anthropic/claude-3.5-haiku).",
  },
  {
    key: "COPILOT_SYSTEM_PROMPT",
    label: "Instrucciones del Copilot (system prompt)",
    group: "Copilot",
    multiline: true,
    helpText:
      "Vacío = usa unas instrucciones por defecto (respuestas cortas, conversacionales, sin markdown). Personaliza el tono y el enfoque del asistente.",
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
  {
    key: "GOOGLE_CLIENT_ID",
    label: "Client ID (OAuth2)",
    group: "Google (Search Console + GA4)",
    helpText: "Crea el ID de cliente OAuth en Google Cloud Console → Credenciales (aplicación web).",
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    label: "Client Secret (OAuth2)",
    group: "Google (Search Console + GA4)",
    helpText: "Secreto asociado al Client ID. Se guarda cifrado, como el resto de claves.",
  },
  {
    key: "GOOGLE_REDIRECT_URI",
    label: "URI de redirección",
    group: "Google (Search Console + GA4)",
    placeholder: "http://localhost:3000/api/google/oauth/callback",
    helpText:
      "Debe coincidir exactamente con el configurado en Google Cloud. En producción, usa https://tudominio.com/api/google/oauth/callback.",
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
