import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { scrapePage, ScrapeError } from "@/lib/seo/scrape";
import {
  getCatalogEntry,
  isValidSchemaType,
  suggestSchemaType,
  validateJsonLd,
} from "@/lib/seo/schema/catalog";
import { buildDeterministic, buildLlmJsonLd } from "@/lib/seo/schema/generators";
import { logApiUsage } from "@/lib/seo/usage-log";
import { friendlyLlmErrorMessage } from "@/lib/seo/llm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const generations = await prisma.schemaGeneration.findMany({
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

  const type = typeof body.type === "string" ? body.type.trim() : "";
  if (!isValidSchemaType(type)) {
    return NextResponse.json({ error: "Tipo de schema inválido" }, { status: 400 });
  }
  const entry = getCatalogEntry(type)!;

  let scraped;
  try {
    scraped = await scrapePage(url);
  } catch (error) {
    if (error instanceof ScrapeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const suggestedType = suggestSchemaType(project, scraped);

  let jsonLd: Record<string, unknown>;
  let model: string | null = null;

  if (entry.generator === "deterministic") {
    try {
      jsonLd = buildDeterministic(type, { project, scraped, url });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al generar el schema";
      return NextResponse.json({ error: message }, { status: 422 });
    }
  } else {
    let result;
    try {
      result = await buildLlmJsonLd(entry, scraped, url);
    } catch (error) {
      return NextResponse.json({ error: friendlyLlmErrorMessage(error) }, { status: 502 });
    }
    jsonLd = result.jsonLd;
    model = result.model;

    await logApiUsage({
      projectId: id,
      endpoint: `modulo4.schema.${type.toLowerCase()}`,
      model: result.model,
      usage: result.usage,
    });
  }

  const { valid, errors } = validateJsonLd(type, jsonLd);

  const generation = await prisma.schemaGeneration.create({
    data: {
      projectId: id,
      url,
      suggestedType,
      selectedType: type,
      jsonLd: jsonLd as Prisma.InputJsonValue,
      valid,
      validationErrors: errors.length > 0 ? (errors as Prisma.InputJsonValue) : undefined,
      model,
    },
  });

  return NextResponse.json(generation, { status: 201 });
}
