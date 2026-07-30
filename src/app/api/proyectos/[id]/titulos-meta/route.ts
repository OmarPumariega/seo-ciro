import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { normalizeText } from "@/lib/validation";
import { scrapePage, ScrapeError } from "@/lib/seo/scrape";
import { loadSeoRules } from "@/lib/seo/seo-rules";
import { buildSystemPrompt, buildUserMessage, parseVariants } from "@/lib/seo/title-meta";
import { getOpenRouterClient, getDefaultOpenRouterModel, friendlyLlmErrorMessage } from "@/lib/seo/llm";
import { logApiUsage } from "@/lib/seo/usage-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const generations = await prisma.titleMetaGeneration.findMany({
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

  const url = typeof body.url === "string" ? body.url.trim() : "";
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }
  const keyword = normalizeText(body.keyword);

  // Red de seguridad: cualquier excepción no prevista en los pasos de abajo
  // (carga de reglas SEO, resolución del cliente/modelo de OpenRouter,
  // guardado en BD) escapaba sin capturar y Next.js devolvía una respuesta
  // de error genérica no-JSON — el frontend, al hacer `res.json()` sobre eso,
  // lanzaba sin manejarlo y el spinner se quedaba girando para siempre sin
  // mostrar ningún mensaje. Los try/catch específicos de más abajo (scraping,
  // LLM, parseo) siguen igual y no llegan aquí porque hacen `return` antes.
  try {
    let scraped;
    try {
      scraped = await scrapePage(url);
    } catch (error) {
      if (error instanceof ScrapeError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    const seoRules = await loadSeoRules();
    const client = await getOpenRouterClient();
    const model = await getDefaultOpenRouterModel();

    let completion;
    try {
      completion = await client.chat.completions.create({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: buildSystemPrompt(seoRules) },
          { role: "user", content: buildUserMessage(url, scraped, keyword) },
        ],
      });
    } catch (error) {
      console.error("[titulos-meta] error del LLM:", error);
      return NextResponse.json({ error: friendlyLlmErrorMessage(error) }, { status: 502 });
    }

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: "Sin respuesta del modelo" }, { status: 502 });
    }

    let variants;
    try {
      variants = parseVariants(raw);
    } catch {
      return NextResponse.json({ error: "Formato de respuesta de IA inválido" }, { status: 502 });
    }

    const generation = await prisma.titleMetaGeneration.create({
      data: { projectId: id, url, keyword, variants, model },
    });

    // No bloquea la respuesta: la generación ya está creada y guardada, así
    // que un fallo al registrar el coste no debe impedir que el usuario la
    // vea. Antes, un fallo aquí escapaba sin capturar y el resultado, aunque
    // ya guardado en BD, nunca llegaba a la pantalla.
    try {
      await logApiUsage({
        projectId: id,
        endpoint: "modulo3.titulos-meta",
        model,
        usage: completion.usage,
      });
    } catch (error) {
      console.error("[titulos-meta] logApiUsage falló tras generación exitosa:", error);
    }

    return NextResponse.json(generation, { status: 201 });
  } catch (error) {
    console.error("[titulos-meta] error inesperado:", error);
    const message = error instanceof Error ? error.message : "Error inesperado al generar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
