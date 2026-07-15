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

export type CannibalizedPage = {
  url: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type Cannibalization = { query: string; pages: CannibalizedPage[] };

// Detecta keywords canibalizadas: aquellas para las que el sitio posiciona
// 2+ URLs distintas en los últimos `range` días. Pide a Search Console el
// desglose por [query, page] (top 5000 filas) y agrupa en JS por query; las
// queries con 2+ páginas se devuelven con sus URLs ordenadas por clics desc,
// y el conjunto se ordena por clics totales desc para mostrar primero las
// canibalizaciones de mayor impacto.
export async function listCannibalizations(
  auth: GoogleOAuthClient,
  siteUrl: string,
  range: { startDate: string; endDate: string }
): Promise<Cannibalization[]> {
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { data } = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ["query", "page"],
      rowLimit: 5000,
    },
  });

  const byQuery = new Map<string, CannibalizedPage[]>();
  for (const row of data.rows ?? []) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;
    const entry: CannibalizedPage = {
      url: page,
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      position: row.position ?? 0,
    };
    const list = byQuery.get(query);
    if (list) list.push(entry);
    else byQuery.set(query, [entry]);
  }

  const result: Cannibalization[] = [];
  for (const [query, pages] of byQuery) {
    if (pages.length >= 2) {
      pages.sort((a, b) => b.clicks - a.clicks);
      result.push({ query, pages });
    }
  }
  result.sort((a, b) => {
    const aClicks = a.pages.reduce((sum, p) => sum + p.clicks, 0);
    const bClicks = b.pages.reduce((sum, p) => sum + p.clicks, 0);
    return bClicks - aClicks;
  });
  return result;
}

// --- Panel de Search Console (Módulo 6 ampliado) -----------------------------
// Top queries reales (las palabras clave por las que la página aparece en
// Google) con clicks/impresiones/CTR/posición. Datos reales de SERP, no
// estimados — la fuente más fiable de por qué tráfico llega.
export type GscQueryRow = { query: string; clicks: number; impressions: number; ctr: number; position: number };

export async function listTopQueries(
  auth: GoogleOAuthClient,
  siteUrl: string,
  range: { startDate: string; endDate: string },
  rowLimit = 50
): Promise<GscQueryRow[]> {
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { data } = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ["query"],
      rowLimit,
    },
  });

  return (data.rows ?? []).map((row) => ({
    query: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
}

// Top páginas (URLs) por clicks/impresiones. Útil para ver qué contenido tira
// del tráfico y cruzarlo con la auditoría (¿esas páginas están optimizadas?).
export type GscPageRow = { page: string; clicks: number; impressions: number; ctr: number; position: number };

export async function listTopPages(
  auth: GoogleOAuthClient,
  siteUrl: string,
  range: { startDate: string; endDate: string },
  rowLimit = 50
): Promise<GscPageRow[]> {
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { data } = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ["page"],
      rowLimit,
    },
  });

  return (data.rows ?? []).map((row) => ({
    page: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
}

// Desglose por dimensión secundaria (device, country, etc.). Permite ver, p.ej.,
// cuánto tráfico llega desde móvil vs. escritorio o por país. Mismos métricos
// que el resto de la API.
export type GscBreakdownRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function listByDimension(
  auth: GoogleOAuthClient,
  siteUrl: string,
  range: { startDate: string; endDate: string },
  dimension: "device" | "country",
  rowLimit = 50
): Promise<GscBreakdownRow[]> {
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { data } = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: [dimension],
      rowLimit,
    },
  });

  return (data.rows ?? []).map((row) => ({
    key: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
}

// Serie diaria (clicks + impresiones) para pintar la evolución temporal. GSC
// guarda hasta ~16 meses; aquí se pide un rango y se devuelve por día — la ruta
// agrega a meses para reducir el nº de puntos del gráfico.
export type GscDailyPoint = { date: string; clicks: number; impressions: number };

export async function listDailySeries(
  auth: GoogleOAuthClient,
  siteUrl: string,
  range: { startDate: string; endDate: string }
): Promise<GscDailyPoint[]> {
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { data } = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: range.startDate,
      endDate: range.endDate,
      dimensions: ["date"],
      rowLimit: 5000,
    },
  });

  return (data.rows ?? []).map((row) => ({
    date: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
  }));
}
