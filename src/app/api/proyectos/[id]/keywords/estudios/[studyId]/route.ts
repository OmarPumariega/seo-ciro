import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

type StudyWithKeywords = Prisma.KeywordStudyGetPayload<{ include: { keywords: true } }>;

// Cruce gratis con TF-IDF y Rank Tracking (mismo patrón que
// src/app/api/proyectos/[id]/tfidf/route.ts) — así el usuario ve, sin pulsar
// nada, si una keyword del estudio ya tiene un TF-IDF calculado o ya está
// trackeada con una posición conocida, en vez de tener que ir a buscarla a
// mano en otro módulo. Compartido entre GET y PATCH: ambos devuelven el
// estudio completo al frontend, que sustituye su estado con la respuesta.
async function enrichStudy(projectId: string, study: StudyWithKeywords) {
  const keywordList = study.keywords.map((k) => k.keyword);
  const [tfidfRows, rankRows] = keywordList.length
    ? await Promise.all([
        prisma.tfidfResult.findMany({
          where: { projectId, keyword: { in: keywordList } },
          select: { keyword: true },
        }),
        prisma.rankKeyword.findMany({
          where: { projectId, keyword: { in: keywordList } },
          orderBy: { lastCheckedAt: "desc" },
          select: { keyword: true, lastPosition: true },
        }),
      ])
    : [[], []];
  const tfidfSet = new Set(tfidfRows.map((r) => r.keyword));
  // Si hay varias RankKeyword para la misma keyword (distinta ubicación/
  // dispositivo), nos quedamos con la comprobada más reciente (ya viene
  // ordenado desc).
  const positionByKeyword = new Map<string, number | null>();
  for (const rk of rankRows) {
    if (!positionByKeyword.has(rk.keyword)) positionByKeyword.set(rk.keyword, rk.lastPosition);
  }
  return {
    ...study,
    keywords: study.keywords.map((k) => ({
      ...k,
      tfidfAvailable: tfidfSet.has(k.keyword),
      rankPosition: positionByKeyword.get(k.keyword) ?? null,
    })),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; studyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, studyId } = await params;

  const study = await prisma.keywordStudy.findUnique({
    where: { id: studyId },
    include: {
      // Orden secundario por volumen para desempatar prioridades que
      // redondean al mismo entero.
      keywords: { orderBy: [{ priority: "desc" }, { searchVolume: "desc" }] },
    },
  });

  // Verificación de propiedad: el study debe pertenecer al proyecto de la
  // ruta. Si no, 404 (no revelar existencia). Mismo patrón que
  // auditorias/[auditId]/route.ts.
  if (!study || study.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  return NextResponse.json(await enrichStudy(id, study));
}

// Edita el nombre y/o las notas del estudio.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; studyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, studyId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  // Verifica propiedad antes de tocar nada.
  const existing = await prisma.keywordStudy.findUnique({
    where: { id: studyId },
    select: { projectId: true },
  });
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  const data: { name?: string; notes?: string | null; locationCode?: number; languageCode?: string } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 120);
    if (name.length === 0) {
      return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 });
    }
    data.name = name;
  }
  if (typeof body.notes === "string") {
    data.notes = body.notes.trim().slice(0, 2000);
  }
  // notes puede enviarse como null para vaciar el campo desde la UI.
  if (body.notes === null) {
    data.notes = null;
  }
  // Ubicación e idioma: si el usuario se equivocó al crear el estudio (p.ej.
  // no seleccionó Oviedo en el wizard), puede cambiarlo aquí y el siguiente
  // "Lanzar / re-procesar análisis" propagará la nueva ubicación al Rank
  // Tracking (reemplazando las keywords viejas sin histórico).
  if (body.locationCode !== undefined) {
    const raw = Number(body.locationCode);
    data.locationCode = Number.isInteger(raw) && raw > 0 ? raw : 2724;
  }
  if (typeof body.languageCode === "string") {
    if (/^[a-z]{2}$/i.test(body.languageCode)) {
      data.languageCode = body.languageCode.toLowerCase();
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const updated = await prisma.keywordStudy.update({
    where: { id: studyId },
    data,
    include: {
      keywords: { orderBy: [{ priority: "desc" }, { searchVolume: "desc" }] },
    },
  });
  return NextResponse.json(await enrichStudy(id, updated));
}

// Borra el estudio. onDelete: Cascade en Keyword se encarga de sus keywords.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; studyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, studyId } = await params;

  const existing = await prisma.keywordStudy.findUnique({
    where: { id: studyId },
    select: { projectId: true },
  });
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  await prisma.keywordStudy.delete({ where: { id: studyId } });
  return NextResponse.json({ ok: true });
}
