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
import { getOpenRouterClient, DEFAULT_OPENROUTER_MODEL, friendlyLlmErrorMessage } from "@/lib/seo/llm";
import { logApiUsage } from "@/lib/seo/usage-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  // Se traen TODAS las generaciones (no solo 20) para poder agrupar por tema:
  // el campo `topic` es la clave de versionado — regenerar el mismo tema
  // produce otra fila con el mismo topic, y todas esas filas son versiones
  // del mismo contenido que el usuario puede comparar/restaurar.
  const all = await prisma.contentGeneration.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });

  const recent = all.slice(0, 20);

  // Agrupa por topic (misma string exacta). `all` ya viene ordenado por
  // createdAt desc, así que cada grupo hereda ese orden sin reordenar.
  const groupMap = new Map<string, typeof all>();
  for (const gen of all) {
    const arr = groupMap.get(gen.topic);
    if (arr) arr.push(gen);
    else groupMap.set(gen.topic, [gen]);
  }
  const groups = Array.from(groupMap.entries())
    .map(([topic, versions]) => ({ topic, versions }))
    .sort((x, y) => {
      const aTime = x.versions[0]?.createdAt.getTime() ?? 0;
      const bTime = y.versions[0]?.createdAt.getTime() ?? 0;
      return bTime - aTime;
    });

  return NextResponse.json({ recent, groups });
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

  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: buildSystemPrompt(type, targetWords, project.toneOfVoice) },
        { role: "user", content: buildUserMessage({ topic, keyword, targetUrl, internalLinks }) },
      ],
    });
  } catch (error) {
    return NextResponse.json({ error: friendlyLlmErrorMessage(error) }, { status: 502 });
  }

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
