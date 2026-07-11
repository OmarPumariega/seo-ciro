import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma, RankKeyword } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { normalizeKeyword } from "@/lib/keywords/normalize";
import { ALLOWED_DEPTHS } from "@/lib/rank/serp";
import { checkRankKeyword } from "@/lib/rank/check";

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

  // Acepta dos formas de body:
  //   • { keyword: "...", device, frequency, depth }          → una sola (legacy)
  //   • { keywords: "una por línea", device, frequency, depth } → lote
  // Parsea líneas, normaliza, dedupe (preservando orden de entrada) y descarta
  // vacías. Así el usuario puede pegar una lista larga y la creamos toda.
  const keywordRaw = typeof body.keyword === "string" ? body.keyword : "";
  const keywordsRaw = typeof body.keywords === "string" ? body.keywords : keywordRaw;
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const line of keywordsRaw.split("\n")) {
    const kw = normalizeKeyword(line);
    if (!kw) continue;
    if (seen.has(kw)) continue;
    seen.add(kw);
    candidates.push(kw);
  }
  if (candidates.length === 0) {
    return NextResponse.json({ error: "Debes indicar al menos una keyword" }, { status: 400 });
  }

  // Pre-filtra las que ya existen (mismo projectId + keyword + location +
  // language + device → clave @@unique). Más eficiente que capturar P2002 por
  // cada insert: una sola query cubre todo el lote.
  const existing = await prisma.rankKeyword.findMany({
    where: {
      projectId: id,
      keyword: { in: candidates },
      locationCode,
      languageCode,
      device,
    },
    select: { keyword: true },
  });
  const existingSet = new Set(existing.map((k) => k.keyword));
  const toCreate = candidates.filter((kw) => !existingSet.has(kw));
  const skipped = candidates.filter((kw) => existingSet.has(kw));

  // Crea las nuevas. Aunque pre-filtramos, capturamos P2002 por si una carrera
  // entre el findMany y el create mete un duplicado (otra pestaña): en ese
  // caso la tratamos como "ya existente" y no rompemos el lote.
  const checked: RankKeyword[] = [];
  const errors: { keyword: string; error: string }[] = [];
  for (const kw of toCreate) {
    let created: RankKeyword | null = null;
    try {
      created = await prisma.rankKeyword.create({
        data: { projectId: id, keyword: kw, device, frequency, languageCode, locationCode, depth },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skipped.push(kw);
        continue;
      }
      throw error;
    }

    // Chequeo inmediato (síncrono) para que el usuario vea la posición al
    // añadir, sin tener que ir a "comprobar ahora". El tope de gasto y los
    // fallos de SERP se capturan por keyword: si una falla, la keyword queda
    // creada (sin posición) y se registra el error, pero las demás continúan.
    try {
      await checkRankKeyword(created.id);
      const refreshed = await prisma.rankKeyword.findUnique({ where: { id: created.id } });
      if (refreshed) checked.push(refreshed);
    } catch (error) {
      checked.push(created); // creada pero sin posición todavía
      errors.push({
        keyword: kw,
        error: error instanceof Error ? error.message : "Error al comprobar la posición",
      });
    }
  }

  return NextResponse.json(
    { added: toCreate.length, skipped: skipped.length, checked, errors },
    { status: 201 }
  );
}
