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

// Usado por el Módulo 8 (Auditoría Técnica) para saber qué URLs reciben
// impresiones reales en Search Console — señal indirecta de indexación,
// no una comprobación exacta (esa sería la API de Inspección de URLs, que
// exige un scope OAuth que no pedimos). Devuelve las URLs con al menos una
// impresión en el rango de fechas dado.
export async function listImpressedPages(
  auth: GoogleOAuthClient,
  siteUrl: string,
  range: { startDate: string; endDate: string }
): Promise<Set<string>> {
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { data } = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ["page"],
      rowLimit: 5000,
    },
  });

  const pages = (data.rows ?? [])
    .map((row) => row.keys?.[0])
    .filter((url): url is string => Boolean(url));

  return new Set(pages);
}
