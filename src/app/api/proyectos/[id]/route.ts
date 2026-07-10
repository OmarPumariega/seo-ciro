import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

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
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const project = await prisma.project.update({
    where: { id },
    data: {
      name,
      domain: typeof body.domain === "string" && body.domain.trim() ? body.domain.trim() : null,
      isLocalBusiness: Boolean(body.isLocalBusiness),
      businessName: typeof body.businessName === "string" ? body.businessName.trim() || null : null,
      address: typeof body.address === "string" ? body.address.trim() || null : null,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      hours: typeof body.hours === "string" && body.hours.trim() ? { text: body.hours.trim() } : undefined,
      toneOfVoice: typeof body.toneOfVoice === "string" ? body.toneOfVoice.trim() || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    },
  });

  return NextResponse.json(project);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
