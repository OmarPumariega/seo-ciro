import { google } from "googleapis";
import type { GoogleOAuthClient } from "@/lib/google/oauth";

export type Ga4Property = {
  propertyId: string; // "properties/123456789"
  displayName: string;
  accountName: string;
};

export type Ga4Totals = { sessions: number; conversions: number };

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
      metrics: [{ name: "sessions" }, { name: "conversions" }],
    },
  });

  const values = data.rows?.[0]?.metricValues ?? [];
  return {
    sessions: Number(values[0]?.value ?? 0),
    conversions: Number(values[1]?.value ?? 0),
  };
}
