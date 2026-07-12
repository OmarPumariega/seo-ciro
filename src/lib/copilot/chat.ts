import type OpenAI from "openai";
import { getOpenRouterClient, getDefaultOpenRouterModel } from "@/lib/seo/llm";

export type CopilotMessage = {
  role: "user" | "assistant";
  content: string;
};

// Llama al LLM (OpenRouter) con el contexto del proyecto y el historial del
// hilo. Devuelve el texto del assistant, el modelo usado y el usage para
// registrar el coste. Si OPENROUTER_API_KEY no está, getOpenRouterClient lanza
// y el error se propaga a la ruta (que responde 502).
export async function copilotReply(params: {
  systemContext: string;
  messages: CopilotMessage[];
}): Promise<{ content: string; model: string; usage: OpenAI.CompletionUsage | undefined }> {
  const client = await getOpenRouterClient();
  const model = await getDefaultOpenRouterModel();

  const systemPrompt =
    "Eres un consultor SEO experto. Responde en español, claro y accionable. " +
    "Tienes estos datos REALES del proyecto:\n" +
    `${params.systemContext}\n\n` +
    "Basa tus consejos en esos datos; si faltan, dilo.";

  const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];
  for (const m of params.messages) {
    apiMessages.push(
      m.role === "user"
        ? { role: "user", content: m.content }
        : { role: "assistant", content: m.content }
    );
  }

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: apiMessages,
  });

  return {
    content: completion.choices[0]?.message?.content ?? "",
    model: completion.model,
    usage: completion.usage,
  };
}
