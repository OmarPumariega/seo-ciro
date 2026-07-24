import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google/client";
import {
  getReportTotals,
  listByChannel,
  listTopLandingPages,
  listByDevice,
  listMonthlySeries,
  type Ga4Totals,
  type Ga4ChannelRow,
  type Ga4LandingPageRow,
  type Ga4DeviceRow,
  type Ga4MonthPoint,
} from "@/lib/google/analytics";
import { classifyGoogleError } from "@/lib/google/errors";

// Panel completo de GA4 — mismo criterio que el panel de Search Console
// (search-console/route.ts): antes GA4 solo se consultaba para 2 números
// totales (dashboard/route.ts), sin dimensiones. Aquí se explota a fondo
// runReport con canal/página de aterrizaje/dispositivo/evolución mensual,
// igual que GSC ya hacía. Cuota gratuita de Google — sin coste nuevo.
const RANGE_OPTIONS: Record<string, number> = {
  "28d": 28,
  "3m": 90,
  "6m": 180,
  "12m": 365,
};
const DEFAULT_RANGE = "3m";

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Range = { startDate: string; endDate: string };

function rangeFor(days: number): Range {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { startDate: fmt(start), endDate: fmt(end) };
}

export type Ga4Detail = {
  rangeKey: string;
  rangeDays: number;
  totals: Ga4Totals;
  byChannel: Ga4ChannelRow[];
  topLandingPages: Ga4LandingPageRow[];
  byDevice: Ga4DeviceRow[];
  monthly: Ga4MonthPoint[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  if (!project.ga4PropertyId) {
    return NextResponse.json(
      { error: "Este proyecto no tiene propiedad de GA4 seleccionada." },
      { status: 400 }
    );
  }

  const rangeKeyParam = req.nextUrl.searchParams.get("range") ?? DEFAULT_RANGE;
  const rangeKey = RANGE_OPTIONS[rangeKeyParam] ? rangeKeyParam : DEFAULT_RANGE;
  const rangeDays = RANGE_OPTIONS[rangeKey];

  let auth;
  try {
    auth = await getGoogleClient();
  } catch (error) {
    if (error instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { error: "No hay ninguna cuenta de Google conectada." },
        { status: 409 }
      );
    }
    throw error;
  }

  const cur = rangeFor(rangeDays);
  const seriesRange: Range = { startDate: fmt(new Date(Date.now() - 365 * 24 * 3600 * 1000)), endDate: cur.endDate };

  try {
    const [totals, byChannel, topLandingPages, byDevice, monthly] = await Promise.all([
      getReportTotals(auth, project.ga4PropertyId, cur),
      listByChannel(auth, project.ga4PropertyId, cur),
      listTopLandingPages(auth, project.ga4PropertyId, cur),
      listByDevice(auth, project.ga4PropertyId, cur),
      listMonthlySeries(auth, project.ga4PropertyId, seriesRange),
    ]);

    const detail: Ga4Detail = { rangeKey, rangeDays, totals, byChannel, topLandingPages, byDevice, monthly };

    // Persiste un snapshot por proyecto y mes (dedupe) — mismo patrón que
    // GscSnapshot: el Copilot y otros módulos pueden leer comportamiento
    // on-site real sin llamar a la API en vivo, y se acumula histórico.
    const currentMonth = fmt(new Date()).slice(0, 7);
    await prisma.ga4Snapshot.upsert({
      where: { projectId_month: { projectId: id, month: currentMonth } },
      create: {
        projectId: id,
        month: currentMonth,
        rangeDays,
        totals: totals as unknown as Prisma.InputJsonValue,
        byChannel: byChannel as unknown as Prisma.InputJsonValue,
        topLandingPages: topLandingPages as unknown as Prisma.InputJsonValue,
        byDevice: byDevice as unknown as Prisma.InputJsonValue,
        monthly: monthly as unknown as Prisma.InputJsonValue,
      },
      update: {
        rangeDays,
        totals: totals as unknown as Prisma.InputJsonValue,
        byChannel: byChannel as unknown as Prisma.InputJsonValue,
        topLandingPages: topLandingPages as unknown as Prisma.InputJsonValue,
        byDevice: byDevice as unknown as Prisma.InputJsonValue,
        monthly: monthly as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json({ error: classifyGoogleError(error).message }, { status: 502 });
  }
}
