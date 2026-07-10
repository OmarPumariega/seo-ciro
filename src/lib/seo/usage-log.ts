import type OpenAI from "openai";
import { prisma } from "@/lib/db/prisma";

// OpenRouter añade un campo `cost` (créditos) a la respuesta estándar de
// OpenAI que el SDK no tipa — se lee de forma defensiva, nunca se asume
// presente.
type OpenRouterUsage = OpenAI.CompletionUsage & { cost?: number };

export async function logApiUsage(params: {
  projectId: string;
  endpoint: string;
  model: string;
  usage: OpenAI.CompletionUsage | undefined;
}) {
  const usage = params.usage as OpenRouterUsage | undefined;

  await prisma.apiUsageLog.create({
    data: {
      projectId: params.projectId,
      api: "openrouter",
      endpoint: params.endpoint,
      model: params.model,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      costUsd: typeof usage?.cost === "number" ? usage.cost : null,
    },
  });
}
