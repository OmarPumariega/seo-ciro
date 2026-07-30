import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { normalizeText } from "@/lib/validation";
import { scrapePage, ScrapeError } from "@/lib/seo/scrape";
import { normalizeUrl } from "@/lib/seo/normalize-url";
import { findTrackedKeywordForUrl } from "@/lib/rank/find-tracked-keyword";
import {
  getOrComputeTfidfResult,
  TfidfNoResultsError,
  DataForSeoError,
  DataForSeoSpendLimitError,
} from "@/lib/tfidf/get-or-compute";
import { OPTIMIZE_SYSTEM_PROMPT, buildOptimizationUserMessage, type OptimizationSuggestion, type GapKeyword } from "@/lib/seo/optimize";
import { stripCodeFences } from "@/lib/seo/json";
import { getOpenRouterClient, getDefaultOpenRouterModel, friendlyLlmErrorMessage } from "@/lib/seo/llm";
import { logApiUsage } from "@/lib/seo/usage-log";

// GET: historial de optimizaciones previas — gratis, solo lee lo ya
// persistido. Dos modos:
//   • ?url=... → historial de esa URL concreta (comportamiento original).
//   • sin url  → últimas optimizaciones del proyecto (una por URL, la más
//     reciente), para que el panel nazca ya pintado con lo que existe en BD
//     sin que el usuario tenga que escribir nada primero.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    const recent = await prisma.urlOptimization.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      distinct: ["url"],
      take: 20,
    });
    return NextResponse.json(recent);
  }

  const runs = await prisma.urlOptimization.findMany({
    where: { projectId: id, url },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json(runs);
}

// POST: analiza una URL propia YA PUBLICADA (scrape + TF-IDF + gap de
// competidores + estudio General) y devuelve una lista de cambios
// concretos — nunca un texto reescrito completo. PAGA (LLM siempre; TF-IDF
// solo si esa keyword no se había analizado antes en este proyecto).
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

  const url = normalizeText(body.url, 2000);
  if (!url || !normalizeUrl(url)) {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }
  const manualKeyword = normalizeText(body.targetKeyword);

  // 1) Scrape del contenido actual de la página.
  let scraped;
  try {
    scraped = await scrapePage(url);
  } catch (error) {
    if (error instanceof ScrapeError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }

  // 2) Resolver keyword objetivo: manual, o autosugerida desde Rank Tracking.
  const tracked = await findTrackedKeywordForUrl(id, url);
  const targetKeyword = manualKeyword || tracked?.keyword || null;
  if (!targetKeyword) {
    return NextResponse.json(
      { error: "Esta URL no está en seguimiento de Rank Tracking — indica la keyword objetivo manualmente." },
      { status: 400 }
    );
  }
  // La posición solo es fiable si la keyword resuelta es la misma que la
  // trackeada (si el usuario sobrescribió con otra keyword, no sabemos su
  // posición para esa keyword distinta).
  const rankPosition = targetKeyword === tracked?.keyword ? tracked.lastPosition : null;

  // 3) TF-IDF de esa keyword — reusa lo ya calculado o lo lanza si falta
  // (mismo coste que ejecutarlo a mano en el módulo TF-IDF).
  let tfidfResult = null;
  try {
    // Si la keyword resuelta es la trackeada, usa SU ubicación/idioma reales
    // (no los defaults es/2724) — si no, nunca reutilizaría el SerpCache que
    // Rank Tracking ya pagó para esa keyword en su ubicación real, y encima
    // calcularía el TF-IDF para una ubicación distinta a la trackeada.
    const isTrackedMatch = targetKeyword === tracked?.keyword;
    const outcome = await getOrComputeTfidfResult({
      projectId: id,
      keyword: targetKeyword,
      locationCode: isTrackedMatch ? tracked?.locationCode : undefined,
      languageCode: isTrackedMatch ? tracked?.languageCode : undefined,
    });
    tfidfResult = outcome.result;
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof TfidfNoResultsError) {
      // Sin resultados orgánicos para la keyword: seguimos sin TF-IDF, el
      // resto de contexto (gap, estudio) sigue siendo útil.
      tfidfResult = null;
    } else if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    } else {
      throw error;
    }
  }

  // Red de seguridad: de aquí en adelante, cualquier excepción no prevista
  // (lecturas de BD, guardado final) escapaba sin capturar y el frontend se
  // quedaba "colgado" sin ningún mensaje — mismo bug encontrado y arreglado
  // en Título y Meta. Los try/catch específicos de arriba (scraping, TF-IDF)
  // y de abajo (LLM, parseo) no cambian de comportamiento.
  try {
    // 4) Contexto gratis ya persistido: gap de competidores + estudio General.
    const competitors = await prisma.competitor.findMany({
      where: { projectId: id, contentGap: { not: Prisma.DbNull } },
      select: { contentGap: true },
    });
    const gapMap = new Map<string, GapKeyword>();
    for (const c of competitors) {
      const items = (c.contentGap as unknown as Array<{ keyword: string; volume: number | null; difficulty?: number | null }>) ?? [];
      for (const item of items) {
        const existing = gapMap.get(item.keyword);
        if (!existing || (item.volume ?? 0) > (existing.volume ?? 0)) {
          gapMap.set(item.keyword, { keyword: item.keyword, volume: item.volume ?? null, difficulty: item.difficulty ?? null });
        }
      }
    }
    const gapKeywords = Array.from(gapMap.values())
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 30);

    let studyKeywords: { keyword: string; searchVolume: number | null; priority: number }[] = [];
    if (project.defaultKeywordStudyId) {
      studyKeywords = await prisma.keyword.findMany({
        where: { studyId: project.defaultKeywordStudyId },
        orderBy: { priority: "desc" },
        take: 30,
        select: { keyword: true, searchVolume: true, priority: true },
      });
    }

    // 5) LLM: JSON estricto con la lista de cambios.
    const client = await getOpenRouterClient();
    const model = await getDefaultOpenRouterModel();

    let completion;
    try {
      completion = await client.chat.completions.create({
        model,
        temperature: 0.4,
        messages: [
          { role: "system", content: OPTIMIZE_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildOptimizationUserMessage({
              url,
              targetKeyword,
              rankPosition,
              scraped,
              tfidf: tfidfResult,
              gapKeywords,
              studyKeywords,
            }),
          },
        ],
      });
    } catch (error) {
      console.error("[optimizar-url] error del LLM:", error);
      return NextResponse.json({ error: friendlyLlmErrorMessage(error) }, { status: 502 });
    }

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return NextResponse.json({ error: "Sin respuesta del modelo" }, { status: 502 });

    let suggestions: OptimizationSuggestion[];
    try {
      const parsed = JSON.parse(stripCodeFences(raw));
      suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    } catch {
      return NextResponse.json({ error: "El modelo devolvió una respuesta que no se pudo interpretar. Inténtalo de nuevo." }, { status: 502 });
    }

    const currentSnapshot = {
      title: scraped.title,
      metaDescription: scraped.metaDescription,
      h1: scraped.h1,
      headings: scraped.headings,
      wordCount: scraped.bodyText.split(/\s+/).filter(Boolean).length,
    };

    const run = await prisma.urlOptimization.create({
      data: {
        projectId: id,
        url,
        targetKeyword,
        currentSnapshot: currentSnapshot as unknown as Prisma.InputJsonValue,
        rankPosition,
        suggestions: suggestions as unknown as Prisma.InputJsonValue,
        model,
      },
    });

    // No bloquea la respuesta: la generación ya está guardada, un fallo al
    // registrar el coste no debe impedir que el usuario la vea. El coste del
    // TF-IDF (si se calculó de nuevo) ya lo registra getOrComputeTfidfResult
    // internamente — solo registramos el del LLM aquí.
    try {
      await logApiUsage({ projectId: id, endpoint: "modulo7.optimizar-url", model, usage: completion.usage });
    } catch (error) {
      console.error("[optimizar-url] logApiUsage falló tras generación exitosa:", error);
    }

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    console.error("[optimizar-url] error inesperado:", error);
    const message = error instanceof Error ? error.message : "Error inesperado al generar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
