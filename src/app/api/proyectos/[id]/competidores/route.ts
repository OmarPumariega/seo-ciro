import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { normalizeDomain } from "@/lib/competitors/dataforseo";

// GET: visibilidad del propio dominio + lista de competidores con su último
// snapshot (ver es gratis; solo se paga al "analizar"). Un snapshot por dominio
// acumula tendencia con el tiempo.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { domain: true } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const projectDomain = project.domain ? normalizeDomain(project.domain) : null;
  const projectSnapshot = projectDomain
    ? await prisma.visibilitySnapshot.findFirst({
        where: { projectId: id, domain: projectDomain },
        orderBy: { fetchedAt: "desc" },
      })
    : null;

  const competitors = await prisma.competitor.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });

  // Último snapshot de cada competidor (una query por simplicidad; nº bajo).
  const competitorsWithSnapshot = await Promise.all(
    competitors.map(async (c) => ({
      ...c,
      snapshot: await prisma.visibilitySnapshot.findFirst({
        where: { projectId: id, domain: c.domain },
        orderBy: { fetchedAt: "desc" },
      }),
    }))
  );

  return NextResponse.json({ projectDomain, projectSnapshot, competitors: competitorsWithSnapshot });
}

// POST: añadir un competidor (solo el dominio; se analiza después bajo demanda).
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

  const domain = normalizeDomain(typeof body.domain === "string" ? body.domain : "");
  if (!domain) {
    return NextResponse.json({ error: "Dominio inválido" }, { status: 400 });
  }

  try {
    const competitor = await prisma.competitor.create({ data: { projectId: id, domain } });
    return NextResponse.json(competitor, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ese competidor ya está añadido." }, { status: 409 });
    }
    throw error;
  }
}
