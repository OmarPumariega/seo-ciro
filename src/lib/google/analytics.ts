import { google } from "googleapis";
import type { GoogleOAuthClient } from "@/lib/google/oauth";

export type Ga4Property = {
  propertyId: string; // "properties/123456789"
  displayName: string;
  accountName: string;
};

export type Ga4Totals = {
  sessions: number;
  conversions: number;
  engagementRate: number; // 0-1
  averageSessionDuration: number; // segundos
};

export type Ga4ChannelRow = { channel: string; sessions: number; conversions: number };
export type Ga4LandingPageRow = { landingPage: string; sessions: number; conversions: number; engagementRate: number };
export type Ga4DeviceRow = { device: string; sessions: number };
export type Ga4MonthPoint = { month: string; sessions: number; conversions: number };

export async function listProperties(auth: GoogleOAuthClient): Promise<Ga4Property[]> {
  const analyticsadmin = google.analyticsadmin({ version: "v1beta", auth });
  const { data } = await analyticsadmin.accountSummaries.list({ pageSize: 200 });

  const properties: Ga4Property[] = [];
  for (const account of data.accountSummaries ?? []) {
    for (const property of account.propertySummaries ?? []) {
      if (!property.property) continue;
      properties.push({
        propertyId: property.property,
        displayName: property.displayName ?? property.property,
        accountName: account.displayName ?? "",
      });
    }
  }
  return properties;
}

export async function getReportTotals(
  auth: GoogleOAuthClient,
  propertyId: string,
  range: { startDate: string; endDate: string }
): Promise<Ga4Totals> {
  const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
  const { data } = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      metrics: [
        { name: "sessions" },
        { name: "conversions" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
      ],
    },
  });

  const values = data.rows?.[0]?.metricValues ?? [];
  return {
    sessions: Number(values[0]?.value ?? 0),
    conversions: Number(values[1]?.value ?? 0),
    engagementRate: Number(values[2]?.value ?? 0),
    averageSessionDuration: Number(values[3]?.value ?? 0),
  };
}

// A partir de aquí: dimensiones reales que antes nunca se pedían — GA4
// quedaba en 2 números totales mientras Search Console (mismo módulo) ya
// tenía un panel completo (top queries/páginas, desglose por dispositivo/
// país, evolución mensual). Mismo criterio aplicado aquí: canal de tráfico,
// páginas de aterrizaje, dispositivo y evolución — para que el Copilot y la
// ficha del proyecto puedan cruzar comportamiento on-site con lo que ya se
// sabe de SERP (GSC).

export async function listByChannel(
  auth: GoogleOAuthClient,
  propertyId: string,
  range: { startDate: string; endDate: string },
  limit = 10
): Promise<Ga4ChannelRow[]> {
  const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
  const { data } = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: String(limit),
    },
  });

  return (data.rows ?? []).map((row) => ({
    channel: row.dimensionValues?.[0]?.value ?? "(sin canal)",
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
    conversions: Number(row.metricValues?.[1]?.value ?? 0),
  }));
}

export async function listTopLandingPages(
  auth: GoogleOAuthClient,
  propertyId: string,
  range: { startDate: string; endDate: string },
  limit = 20
): Promise<Ga4LandingPageRow[]> {
  const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
  const { data } = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "engagementRate" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: String(limit),
    },
  });

  return (data.rows ?? []).map((row) => ({
    landingPage: row.dimensionValues?.[0]?.value ?? "",
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
    conversions: Number(row.metricValues?.[1]?.value ?? 0),
    engagementRate: Number(row.metricValues?.[2]?.value ?? 0),
  }));
}

export async function listByDevice(
  auth: GoogleOAuthClient,
  propertyId: string,
  range: { startDate: string; endDate: string }
): Promise<Ga4DeviceRow[]> {
  const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
  const { data } = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "10",
    },
  });

  return (data.rows ?? []).map((row) => ({
    device: row.dimensionValues?.[0]?.value ?? "(desconocido)",
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
  }));
}

export async function listMonthlySeries(
  auth: GoogleOAuthClient,
  propertyId: string,
  range: { startDate: string; endDate: string }
): Promise<Ga4MonthPoint[]> {
  const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
  const { data } = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: "yearMonth" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }],
      orderBys: [{ dimension: { dimensionName: "yearMonth" } }],
    },
  });

  return (data.rows ?? []).map((row) => {
    const raw = row.dimensionValues?.[0]?.value ?? "";
    const month = raw.length === 6 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
    return {
      month,
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
      conversions: Number(row.metricValues?.[1]?.value ?? 0),
    };
  });
}
