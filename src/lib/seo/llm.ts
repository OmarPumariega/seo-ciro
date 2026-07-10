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
