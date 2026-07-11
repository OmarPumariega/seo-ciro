import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { normalizeKeyword } from "@/lib/keywords/normalize";
import { ALLOWED_DEPTHS } from "@/lib/rank/serp";

const DEVICES = ["desktop", "mobile"] as const;
const FREQUENCIES = ["manual", "daily", "weekly", "monthly"] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const keywords = await prisma.rankKeyword.findMany({
    where: { projectId: id },
    orderBy: [{ lastCheckedAt: "asc" }],
    // últimas 2 posiciones → la UI calcula la flecha de tendencia
    // (mejor/peor/igual) sin una llamada por keyword.
    include: { positions: { orderBy: { checkedAt: "desc" }, take: 2 } },
  });

  return NextResponse.json(keywords);
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
  if (!project.domain) {
    return NextResponse.json(
      { error: "El proyecto no tiene dominio configurado. Defínelo en la ficha del proyecto antes de seguir keywords." },
      { status: 422 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const keyword = normalizeKeyword(typeof body.keyword === "string" ? body.keyword : "");
  if (!keyword) {
    return NextResponse.json({ error: "Debes indicar una keyword" }, { status: 400 });
  }

  const device = typeof body.device === "string" && (DEVICES as readonly string[]).includes(body.device) ? body.device : "desktop";
  const frequency =
    typeof body.frequency === "string" && (FREQUENCIES as readonly string[]).includes(body.frequency)
      ? body.frequency
      : "weekly";
  const languageCode =
    typeof body.languageCode === "string" && /^[a-z]{2}$/i.test(body.languageCode)
      ? body.languageCode.toLowerCase()
      : "es";
  const rawLocation = Number(body.locationCode);
  const locationCode = Number.isInteger(rawLocation) && rawLocation > 0 ? rawLocation : 2724;
  const rawDepth = Number(body.depth);
  const depth = (ALLOWED_DEPTHS as readonly number[]).includes(rawDepth) ? rawDepth : 10;

  try {
    const created = await prisma.rankKeyword.create({
      data: { projectId: id, keyword, device, frequency, languageCode, locationCode, depth },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Esa keyword ya se sigue para este proyecto con el mismo idioma, ubicación y dispositivo." },
        { status: 409 }
      );
    }
    throw error;
  }
}
