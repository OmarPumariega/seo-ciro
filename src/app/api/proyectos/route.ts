import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { slugify } from "@/lib/utils";

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

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = slugify(typeof body.slug === "string" && body.slug ? body.slug : name);

  if (!name || !slug)
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const existing = await prisma.project.findUnique({ where: { slug } });
  if (existing)
    return NextResponse.json(
      { error: "Ya existe un proyecto con ese identificador" },
      { status: 409 }
    );

  const project = await prisma.project.create({
    data: {
      name,
      slug,
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

  return NextResponse.json(project, { status: 201 });
}
