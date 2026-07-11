import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { slugify } from "@/lib/utils";
import { normalizeRequiredText, normalizeText, MAX_LONG } from "@/lib/validation";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const name = normalizeRequiredText(body.name);
  const slug = slugify(typeof body.slug === "string" && body.slug ? body.slug : name);

  if (!name || !slug)
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const existing = await prisma.project.findUnique({ where: { slug } });
  if (existing)
    return NextResponse.json(
      { error: "Ya existe un proyecto con ese identificador" },
      { status: 409 }
    );

  const hoursText = normalizeText(body.hours, MAX_LONG);

  function parseCoord(key: "lat" | "lng", min: number, max: number): number | undefined {
    const n = Number(body[key]);
    return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
  }
  const lat = parseCoord("lat", -90, 90);
  const lng = parseCoord("lng", -180, 180);

  const project = await prisma.project.create({
    data: {
      name,
      slug,
      domain: normalizeText(body.domain),
      isLocalBusiness: Boolean(body.isLocalBusiness),
      businessName: normalizeText(body.businessName),
      address: normalizeText(body.address, MAX_LONG),
      phone: normalizeText(body.phone),
      hours: hoursText ? { text: hoursText } : undefined,
      toneOfVoice: normalizeText(body.toneOfVoice, MAX_LONG),
      notes: normalizeText(body.notes, MAX_LONG),
      lat,
      lng,
      gbpName: normalizeText(body.gbpName),
      gbpPlaceId: normalizeText(body.gbpPlaceId),
    },
  });

  return NextResponse.json(project, { status: 201 });
}
