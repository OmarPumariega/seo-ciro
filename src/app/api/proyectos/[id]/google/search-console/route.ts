import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google/client";
import {
  getSearchAnalyticsTotals,
  listTopQueries,
  listTopPages,
  listDailySeries,
  listByDimension,
  type GscTotals,
  type GscQueryRow,
  type GscPageRow,
  type GscBreakdownRow,
} from "@/lib/google/search-console";
import { classifyGoogleError } from "@/lib/google/errors";

// Periodos configurables del panel. GSC guarda hasta ~16 meses; 12m es el máximo
// que ofrecemos para no acercar al límite al calcular el periodo anterior (trend).
const RANGE_OPTIONS: Record<string, number> = {
  "28d": 28,
  "3m": 90,
  "6m": 180,
  "12m": 365,
};
const DEFAULT_RANGE = "3m";
const GSC_DATA_LAG_DAYS = 2; // GSC tarda ~2 días en consolidar
const GSC_MAX_SPAN_DAYS = 480; // límite práctico de la API (~16 meses)

const QUERIES_LIMIT = 5000; // máx. por petición de searchanalytics.query
const PAGES_LIMIT = 5000;

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Range = { startDate: string; endDate: string };

function rangeFor(days: number, offsetBack = 0): Range {
  const end = new Date();
  end.setDate(end.getDate() - GSC_DATA_LAG_DAYS - offsetBack);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { startDate: fmt(start), endDate: fmt(end) };
}

type GscQueryWithTrend = GscQueryRow & { prevPosition: number | null };
type GscPageWithTrend = GscPageRow & { prevPosition: number | null };
type GscMonthPoint = { month: string; clicks: number; impressions: number };

export type GscDetail = {
  rangeKey: string;
  rangeDays: number;
  totals: GscTotals;
  topQueries: GscQueryWithTrend[];
  topPages: GscPageWithTrend[];
  byDevice: GscBreakdownRow[];
  byCountry: GscBreakdownRow[];
  timeseries: GscMonthPoint[];
};

// Agrega la serie diaria (12 meses) a puntos mensuales para el gráfico.
function aggregateMonthly(
  daily: { date: string; clicks: number; impressions: number }[]
): GscMonthPoint[] {
  const map = new Map<string, GscMonthPoint>();
  for (const point of daily) {
    const month = point.date.slice(0, 7);
    const existing = map.get(month);
    if (existing) {
      existing.clicks += point.clicks;
      existing.impressions += point.impressions;
    } else {
      map.set(month, { month, clicks: point.clicks, impressions: point.impressions });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  if (!project.gscSiteUrl) {
    return NextResponse.json(
      { error: "Este proyecto no tiene propiedad de Search Console seleccionada." },
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
  // El periodo anterior (para la flecha de tendencia) solo se pide si cabe dentro
  // del límite de ~16 meses de GSC. Para 12m no se calcula (iría demasiado atrás).
  const canCompare = rangeDays * 2 <= GSC_MAX_SPAN_DAYS;
  const prev = canCompare ? rangeFor(rangeDays, rangeDays) : null;

  // La evolución temporal se pide SIEMPRE sobre 12 meses, independientemente del
  // periodo seleccionado para los KPIs/tablas, para que el gráfico tenga sentido
  // incluso cuando el periodo es corto (28d/3m).
  const seriesRange: Range = {
    startDate: fmt(new Date(Date.now() - 365 * 24 * 3600 * 1000)),
    endDate: cur.endDate,
  };

  try {
    const [totals, topQueriesCur, topQueriesPrev, topPagesCur, topPagesPrev, byDevice, byCountry, daily] =
      await Promise.all([
        getSearchAnalyticsTotals(auth, project.gscSiteUrl, cur),
        listTopQueries(auth, project.gscSiteUrl, cur, QUERIES_LIMIT),
        prev ? listTopQueries(auth, project.gscSiteUrl, prev, QUERIES_LIMIT) : Promise.resolve([]),
        listTopPages(auth, project.gscSiteUrl, cur, PAGES_LIMIT),
        prev ? listTopPages(auth, project.gscSiteUrl, prev, PAGES_LIMIT) : Promise.resolve([]),
        listByDimension(auth, project.gscSiteUrl, cur, "device", 10),
        listByDimension(auth, project.gscSiteUrl, cur, "country", 50),
        listDailySeries(auth, project.gscSiteUrl, seriesRange),
      ]);

    const prevQueryPos = new Map(topQueriesPrev.map((q) => [q.query, q.position]));
    const topQueries: GscQueryWithTrend[] = topQueriesCur.map((q) => ({
      ...q,
      prevPosition: prevQueryPos.has(q.query) ? prevQueryPos.get(q.query)! : null,
    }));

    const prevPagePos = new Map(topPagesPrev.map((p) => [p.page, p.position]));
    const topPages: GscPageWithTrend[] = topPagesCur.map((p) => ({
      ...p,
      prevPosition: prevPagePos.has(p.page) ? prevPagePos.get(p.page)! : null,
    }));

    const monthly = aggregateMonthly(daily);

    const detail: GscDetail = {
      rangeKey,
      rangeDays,
      totals,
      topQueries,
      topPages,
      byDevice,
      byCountry,
      timeseries: monthly,
    };

    // Persiste un snapshot por proyecto y mes (dedupe). Así el Copilot y otros
    // módulos pueden leer el rendimiento real sin llamar a GSC en vivo, y se
    // acumula histórico mensual con el uso.
    const currentMonth = fmt(new Date()).slice(0, 7);
    await prisma.gscSnapshot.upsert({
      where: { projectId_month: { projectId: id, month: currentMonth } },
      create: {
        projectId: id,
        month: currentMonth,
        rangeDays,
        totals: detail.totals as Prisma.InputJsonValue,
        topQueries: detail.topQueries as Prisma.InputJsonValue,
        topPages: detail.topPages as Prisma.InputJsonValue,
        byDevice: detail.byDevice as Prisma.InputJsonValue,
        byCountry: detail.byCountry as Prisma.InputJsonValue,
        monthly: monthly as Prisma.InputJsonValue,
      },
      update: {
        rangeDays,
        totals: detail.totals as Prisma.InputJsonValue,
        topQueries: detail.topQueries as Prisma.InputJsonValue,
        topPages: detail.topPages as Prisma.InputJsonValue,
        byDevice: detail.byDevice as Prisma.InputJsonValue,
        byCountry: detail.byCountry as Prisma.InputJsonValue,
        monthly: monthly as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(detail);
  } catch (error) {
    const classified = classifyGoogleError(error);
    return NextResponse.json({ error: classified.message }, { status: classified.status });
  }
}
