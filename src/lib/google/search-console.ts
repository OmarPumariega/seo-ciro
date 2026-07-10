import { google } from "googleapis";
import type { GoogleOAuthClient } from "@/lib/google/oauth";

export type GscSite = { siteUrl: string; permissionLevel: string };

export type GscTotals = { clicks: number; impressions: number; ctr: number; position: number };

export async function listSites(auth: GoogleOAuthClient): Promise<GscSite[]> {
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { data } = await searchconsole.sites.list();
  return (data.siteEntry ?? []).map((site) => ({
    siteUrl: site.siteUrl ?? "",
    permissionLevel: site.permissionLevel ?? "",
  }));
}

export async function getSearchAnalyticsTotals(
  auth: GoogleOAuthClient,
  siteUrl: string,
  range: { startDate: string; endDate: string }
): Promise<GscTotals> {
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { data } = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: { startDate: range.startDate, endDate: range.endDate, rowLimit: 1 },
  });

  const row = data.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}
