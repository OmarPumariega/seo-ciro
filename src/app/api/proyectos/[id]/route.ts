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

  const name = normalizeRequiredText(body.name);
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const hoursText = normalizeText(body.hours, MAX_LONG);

  try {
    const project = await prisma.project.update({
      where: { id },
      data: {
        name,
        domain: normalizeText(body.domain),
        isLocalBusiness: Boolean(body.isLocalBusiness),
        businessName: normalizeText(body.businessName),
        address: normalizeText(body.address, MAX_LONG),
        phone: normalizeText(body.phone),
        // A diferencia de los campos String?, un Json? necesita el sentinel
        // Prisma.DbNull explícito para borrar el valor — pasar `undefined` u
        // otro `null` a secas se interpreta como "no tocar este campo" y el
        // horario anterior quedaría huérfano si el usuario lo vacía.
        hours: hoursText ? { text: hoursText } : Prisma.DbNull,
        toneOfVoice: normalizeText(body.toneOfVoice, MAX_LONG),
        notes: normalizeText(body.notes, MAX_LONG),
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
