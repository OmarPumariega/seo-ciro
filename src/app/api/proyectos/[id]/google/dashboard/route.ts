import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google/client";
import { getSearchAnalyticsTotals, type GscTotals } from "@/lib/google/search-console";
import { getReportTotals, type Ga4Totals } from "@/lib/google/analytics";
import { classifyGoogleError } from "@/lib/google/errors";

const RANGE_DAYS = 28;

function last28Days() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - RANGE_DAYS);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

type SourceResult<T> = T | { error: string } | null;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  if (!project.gscSiteUrl && !project.ga4PropertyId) {
    return NextResponse.json({ gsc: null, ga4: null });
  }

  const range = last28Days();

  let auth;
  try {
    auth = await getGoogleClient();
  } catch (error) {
    if (error instanceof GoogleNotConnectedError) {
      const message = "No hay ninguna cuenta de Google conectada.";
      return NextResponse.json({
        gsc: project.gscSiteUrl ? { error: message } : null,
        ga4: project.ga4PropertyId ? { error: message } : null,
      });
    }
    throw error;
  }

  let gsc: SourceResult<GscTotals> = null;
  if (project.gscSiteUrl) {
    try {
      gsc = await getSearchAnalyticsTotals(auth, project.gscSiteUrl, range);
    } catch (error) {
      gsc = { error: classifyGoogleError(error).message };
    }
  }

  let ga4: SourceResult<Ga4Totals> = null;
  if (project.ga4PropertyId) {
    try {
      ga4 = await getReportTotals(auth, project.ga4PropertyId, range);
    } catch (error) {
      ga4 = { error: classifyGoogleError(error).message };
    }
  }

  return NextResponse.json({ gsc, ga4 });
}
