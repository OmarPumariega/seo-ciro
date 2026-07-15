import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { normalizeRequiredText, normalizeText, MAX_LONG } from "@/lib/validation";

// P2025 = "Record not found" — el proyecto se borró entre que se cargó la
// página y se envió el formulario (pestaña obsoleta, doble clic, etc.).
function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  // `name` solo es obligatorio cuando el body lo traza (pestaña Perfil). La
  // pestaña Google hace un PATCH parcial con solo { gscSiteUrl, ga4PropertyId }
  // y no debe chocar con esta validación. Ausente → no se toca el campo.
  const name = "name" in body ? normalizeRequiredText(body.name) : undefined;
  if (name !== undefined && !name) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const hoursText = "hours" in body ? normalizeText(body.hours, MAX_LONG) : null;

  // Coordenadas del negocio (Módulo 9 Geogrid). Solo se tocan si el body las
  // traza explícitamente (la pestaña Perfil siempre las manda). Rango válido:
  // lat [-90, 90], lng [-180, 180]; fuera de rango → null.
  function parseCoord(key: "lat" | "lng", min: number, max: number): number | null | undefined {
    if (!(key in body)) return undefined;
    const n = Number(body[key]);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  }
  const lat = parseCoord("lat", -90, 90);
  const lng = parseCoord("lng", -180, 180);
  // Tope de proyecto: si la key viene en el body, número >=0 o null (vaciar).
  let spendLimitUsd: number | null | undefined = undefined;
  if ("spendLimitUsd" in body) {
    const raw = body.spendLimitUsd;
    const n = Number(raw);
    spendLimitUsd = raw === "" || !Number.isFinite(n) || n < 0 ? null : n;
  }

  try {
    const project = await prisma.project.update({
      where: { id },
      data: {
        // Todos los campos se protegen con "campo" in body: la pestaña Perfil
        // manda el formulario completo (todo presente → se actualiza todo),
        // pero la pestaña Google hace un PATCH parcial con solo gscSiteUrl /
        // ga4PropertyId. Sin esta guarda, esos campos ausentes se seteaban a
        // null/false y borraban datos del proyecto (dominio, NAP, marca...).
        name,
        domain:
          "domain" in body
            ? normalizeText(body.domain)?.replace(/^https?:\/\//, "").replace(/\/$/, "")
            : undefined,
        isLocalBusiness: "isLocalBusiness" in body ? Boolean(body.isLocalBusiness) : undefined,
        businessName: "businessName" in body ? normalizeText(body.businessName) : undefined,
        address: "address" in body ? normalizeText(body.address, MAX_LONG) : undefined,
        phone: "phone" in body ? normalizeText(body.phone) : undefined,
        // A diferencia de los campos String?, un Json? necesita el sentinel
        // Prisma.DbNull explícito para borrar el valor — pasar `undefined` u
        // otro `null` a secas se interpreta como "no tocar este campo" y el
        // horario anterior quedaría huérfano si el usuario lo vacía.
        hours:
          "hours" in body ? (hoursText ? { text: hoursText } : Prisma.DbNull) : undefined,
        toneOfVoice: "toneOfVoice" in body ? normalizeText(body.toneOfVoice, MAX_LONG) : undefined,
        notes: "notes" in body ? normalizeText(body.notes, MAX_LONG) : undefined,
        lat,
        lng,
        gbpName: "gbpName" in body ? normalizeText(body.gbpName) : undefined,
        gbpPlaceId: "gbpPlaceId" in body ? normalizeText(body.gbpPlaceId) : undefined,
        spendLimitUsd,
        // Solo la pestaña "Google" envía estas claves (incluso como null al
        // limpiar una selección); la pestaña Perfil no las toca.
        gscSiteUrl: "gscSiteUrl" in body ? normalizeText(body.gscSiteUrl) : undefined,
        ga4PropertyId: "ga4PropertyId" in body ? normalizeText(body.ga4PropertyId) : undefined,
      },
    });
    return NextResponse.json(project);
  } catch (error) {
    if (isNotFoundError(error))
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  try {
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isNotFoundError(error))
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    throw error;
  }
}
