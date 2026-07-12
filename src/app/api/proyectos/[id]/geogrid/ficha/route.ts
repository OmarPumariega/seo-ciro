import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { assertWithinSpendLimit, DataForSeoSpendLimitError } from "@/lib/dataforseo/spend";
import { searchGbpCandidates } from "@/lib/geogrid/places-search";

// GET ?q=<nombre del negocio> — busca en Google Maps (vía DataForSEO) para
// que el usuario elija la ficha correcta antes de fijar el centro del
// geogrid, en vez de teclear lat/lng a mano.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ error: "Falta el texto a buscar" }, { status: 400 });

  try {
    await assertWithinSpendLimit(id);
    const { candidates, costUsd } = await searchGbpCandidates(query);

    if (costUsd !== null) {
      await prisma.apiUsageLog.create({
        data: { projectId: id, api: "dataforseo", endpoint: "modulo9.geogrid.buscar-ficha", model: null, costUsd },
      });
    }

    return NextResponse.json({ candidates });
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : "Error al buscar la ficha";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH — aplica la ficha elegida como referencia del negocio: place_id
// (matching 1:1 en Maps SERP) + coordenadas verificadas por Google (centro
// del geogrid). businessName/address solo se rellenan si el proyecto no
// tenía ya uno propio — elegir una ficha no debe pisar un nombre/dirección
// que el usuario ya haya escrito a mano.
export async function PATCH(
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

  const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!placeId || !title || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Ficha inválida — faltan place_id o coordenadas" }, { status: 400 });
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      gbpPlaceId: placeId,
      gbpName: title,
      lat,
      lng,
      businessName: project.businessName ?? title,
      address: project.address ?? (address || null),
    },
  });

  return NextResponse.json(updated);
}
