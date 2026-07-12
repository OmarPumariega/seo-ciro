import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { scrapePage, ScrapeError } from "@/lib/seo/scrape";
import {
  SCHEMA_TYPES,
  buildArticleOrFaqJsonLd,
  buildLocalBusinessJsonLd,
  suggestSchemaType,
  validateJsonLd,
  type SchemaType,
} from "@/lib/seo/schema";
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

  const type = body.type as SchemaType;
  if (!SCHEMA_TYPES.includes(type)) {
    return NextResponse.json({ error: "Tipo de schema inválido" }, { status: 400 });
  }

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

  if (type === "LocalBusiness") {
    if (!project.isLocalBusiness || !project.businessName) {
      return NextResponse.json(
        {
          error:
            "Este proyecto no tiene datos NAP configurados. Complétalos en la ficha del proyecto antes de generar un schema LocalBusiness.",
        },
        { status: 422 }
      );
    }
    jsonLd = buildLocalBusinessJsonLd(project, scraped, url);
  } else {
    let result;
    try {
      result = await buildArticleOrFaqJsonLd(type, scraped, url);
    } catch (error) {
      return NextResponse.json({ error: friendlyLlmErrorMessage(error) }, { status: 502 });
    }
    jsonLd = result.jsonLd;
    model = result.model;

    await logApiUsage({
      projectId: id,
      endpoint: `modulo4.schema.${type === "Article" ? "article" : "faq"}`,
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
