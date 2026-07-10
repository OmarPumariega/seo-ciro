import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { normalizeRequiredText, normalizeText, MAX_LONG } from "@/lib/validation";
import {
  CONTENT_TYPES,
  DEFAULT_TARGET_WORDS,
  buildSystemPrompt,
  buildUserMessage,
  countWords,
  type ContentType,
} from "@/lib/seo/content";
import { getOpenRouterClient, DEFAULT_OPENROUTER_MODEL } from "@/lib/seo/llm";
import { logApiUsage } from "@/lib/seo/usage-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const generations = await prisma.contentGeneration.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(generations);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const type = body.type as ContentType;
  if (!CONTENT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Tipo de contenido inválido" }, { status: 400 });
  }

  const topic = normalizeRequiredText(body.topic, MAX_LONG);
  if (!topic) return NextResponse.json({ error: "El tema es obligatorio" }, { status: 400 });

  const keyword = normalizeText(body.keyword);
  const targetUrl = normalizeText(body.targetUrl);
  const internalLinks = normalizeText(body.internalLinks, MAX_LONG);

  const targetWordsRaw = Number(body.targetWords);
  const targetWords =
    Number.isFinite(targetWordsRaw) && targetWordsRaw > 0
      ? Math.round(targetWordsRaw)
      : DEFAULT_TARGET_WORDS[type];

  const client = getOpenRouterClient();
  const model = DEFAULT_OPENROUTER_MODEL;

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.7,
    messages: [
      { role: "system", content: buildSystemPrompt(type, targetWords, project.toneOfVoice) },
      { role: "user", content: buildUserMessage({ topic, keyword, targetUrl, internalLinks }) },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: "Sin respuesta del modelo" }, { status: 502 });
  }

  const generation = await prisma.contentGeneration.create({
    data: {
      projectId: id,
      type,
      topic,
      keyword,
      targetUrl,
      content,
      wordCount: countWords(content),
      model,
    },
  });

  await logApiUsage({
    projectId: id,
    endpoint: "modulo7.contenido",
    model,
    usage: completion.usage,
  });

  return NextResponse.json(generation, { status: 201 });
}
