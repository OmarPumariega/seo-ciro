import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { normalizeDomain } from "@/lib/backlinks/dataforseo";

// GET: autoridad del propio dominio + de cada competidor ya trackeado en el
// módulo Competidores (misma lista, sin duplicarla) con su último snapshot de
// backlinks — ver es gratis, solo "Analizar" paga (API de Backlinks, producto
// nuevo de DataForSEO, ver dataforseo.ts).
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
    ? await prisma.backlinkSnapshot.findFirst({
        where: { projectId: id, domain: projectDomain },
        orderBy: { fetchedAt: "desc" },
      })
    : null;

  const competitors = await prisma.competitor.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });

  const competitorsWithSnapshot = await Promise.all(
    competitors.map(async (c) => ({
      domain: c.domain,
      snapshot: await prisma.backlinkSnapshot.findFirst({
        where: { projectId: id, domain: c.domain },
        orderBy: { fetchedAt: "desc" },
      }),
    }))
  );

  return NextResponse.json({ projectDomain, projectSnapshot, competitors: competitorsWithSnapshot });
}
