import type OpenAI from "openai";
import { getOpenRouterClient, getCopilotModel, getCopilotSystemPrompt } from "@/lib/seo/llm";

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
  const [model, basePrompt] = await Promise.all([getCopilotModel(), getCopilotSystemPrompt()]);

  // El system prompt configurable envuelve el contexto real del proyecto: así
  // el tono/longitud se controlan desde Configuración sin tocar código.
  const systemPrompt =
    `${basePrompt}\n\n` +
    "Datos REALES del proyecto (basa tus respuestas en ellos):\n" +
    params.systemContext;

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
    temperature: 0.5,
    messages: apiMessages,
  });

  return {
    content: completion.choices[0]?.message?.content ?? "",
    model: completion.model,
    usage: completion.usage,
  };
}
