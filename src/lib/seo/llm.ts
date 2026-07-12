import OpenAI from "openai";
import { getSetting } from "@/lib/settings";

// El cliente no se cachea a nivel de módulo (a diferencia de la versión
// anterior): la API key puede cambiar en caliente desde Configuración, y
// construir el cliente es barato (no abre conexión hasta la primera
// llamada) — cachear habría servido una clave vieja hasta reiniciar el
// proceso.
export async function getOpenRouterClient(): Promise<OpenAI> {
  const apiKey = await getSetting("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("Falta la clave de OpenRouter — configúrala en Configuración o en OPENROUTER_API_KEY");
  }
  return new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
}

export async function getDefaultOpenRouterModel(): Promise<string> {
  return (await getSetting("OPENROUTER_MODEL")) || "openai/gpt-4o-mini";
}

// Traduce errores del SDK de OpenAI/OpenRouter a un mensaje que un usuario no
// técnico pueda entender y actuar — antes se devolvía error.message tal cual
// (p.ej. "401 Missing Authentication header"), que parecía "la función está
// rota" en vez de "falta configurar la clave de OpenRouter".
export function friendlyLlmErrorMessage(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      return "OpenRouter ha rechazado la clave configurada. Revísala en Configuración.";
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
