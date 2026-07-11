import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google/client";
import { listCannibalizations } from "@/lib/google/search-console";
import { classifyGoogleError } from "@/lib/google/errors";

const RANGE_DAYS = 90;

function last90Days() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - RANGE_DAYS);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
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

  if (!project.gscSiteUrl) {
    return NextResponse.json({ needsGsc: true });
  }

  let auth;
  try {
    auth = await getGoogleClient();
  } catch (error) {
    if (error instanceof GoogleNotConnectedError) {
      return NextResponse.json({ needsGsc: true });
    }
    throw error;
  }

  try {
    const items = await listCannibalizations(auth, project.gscSiteUrl, last90Days());
    return NextResponse.json({ items });
  } catch (error) {
    const { status, message } = classifyGoogleError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
