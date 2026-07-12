import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenRouterClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("Falta la variable de entorno OPENROUTER_API_KEY");
    client = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
  }
  return client;
}

export const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

// Traduce errores del SDK de OpenAI/OpenRouter a un mensaje que un usuario no
// técnico pueda entender y actuar — antes se devolvía error.message tal cual
// (p.ej. "401 Missing Authentication header"), que parecía "la función está
// rota" en vez de "falta configurar la clave de OpenRouter en el servidor".
export function friendlyLlmErrorMessage(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      return "OpenRouter ha rechazado la clave configurada en el servidor (OPENROUTER_API_KEY). Revísala en la configuración.";
    }
    if (error.status === 429) {
      return "OpenRouter ha devuelto un límite de peticiones superado. Inténtalo de nuevo en unos segundos.";
    }
    if (error.status && error.status >= 500) {
      return "OpenRouter no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.";
    }
    return `OpenRouter devolvió un error: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Error al generar con IA";
}
