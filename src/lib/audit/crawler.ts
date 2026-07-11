import * as cheerio from "cheerio";
import { loadRobotsRules, CRAWLER_USER_AGENT } from "@/lib/audit/robots";

const MAX_PAGES = 50;
const MAX_DEPTH = 4;
const PAGE_TIMEOUT_MS = 10000;
const PAGE_DELAY_MS = 400;
const EXTRA_LINK_CHECK_CAP = 100;
const LINK_CHECK_TIMEOUT_MS = 5000;
const LINK_CHECK_DELAY_MS = 200;
const MAX_BROKEN_SAMPLE = 10;

export type CrawledPage = {
  url: string;
  statusCode: number | null;
  isHttps: boolean;
  canonicalUrl: string | null;
  metaRobots: string | null;
  imagesTotal: number;
  imagesMissingAlt: number;
  linksCheckedCount: number; // enlaces con estado resuelto (visitados o comprobados)
  brokenLinksCount: number;
  brokenLinksSample: string[];
};

export type CrawlResult = {
  pages: CrawledPage[];
  robotsBlocked: boolean;
  sitemapFound: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

async function checkSitemap(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/sitemap.xml`, {
      method: "HEAD",
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type PageAnalysis = {
  page: CrawledPage;
  internalLinks: string[];
};

async function fetchAndAnalyzePage(url: string, origin: string): Promise<PageAnalysis> {
  const isHttps = new URL(url).protocol === "https:";
  const base: CrawledPage = {
    url,
    statusCode: null,
    isHttps,
    canonicalUrl: null,
    metaRobots: null,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    linksCheckedCount: 0,
    brokenLinksCount: 0,
    brokenLinksSample: [],
  };

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    return { page: base, internalLinks: [] };
  }

  base.statusCode = res.status;

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("text/html")) {
    return { page: base, internalLinks: [] };
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  base.canonicalUrl = $('link[rel="canonical"]').attr("href")?.trim() || null;
  base.metaRobots = $('meta[name="robots"]').attr("content")?.trim() || null;

  $("img").each((_, el) => {
    base.imagesTotal += 1;
    if ($(el).attr("alt") === undefined) base.imagesMissingAlt += 1;
  });

  const internalLinks: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let resolved: string | null;
    try {
      resolved = normalizeUrl(new URL(href, url).toString());
    } catch {
      resolved = null;
    }
    if (resolved && new URL(resolved).origin === origin) internalLinks.push(resolved);
  });

  return { page: base, internalLinks: [...new Set(internalLinks)] };
}

async function checkLinkStatus(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
      redirect: "follow",
    });
    // Algunos servidores no soportan HEAD correctamente (405/501) — reintenta con GET.
    if (res.status === 405 || res.status === 501) {
      const getRes = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": CRAWLER_USER_AGENT },
        signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
        redirect: "follow",
      });
      return getRes.status;
    }
    return res.status;
  } catch {
    return null; // inalcanzable — se trata como roto
  }
}

export async function crawlSite(startUrl: string): Promise<CrawlResult> {
  const start = normalizeUrl(startUrl);
  if (!start) return { pages: [], robotsBlocked: false, sitemapFound: false };

  const origin = new URL(start).origin;
  const robots = await loadRobotsRules(origin);

  if (!robots.isAllowed(start)) {
    return { pages: [], robotsBlocked: true, sitemapFound: false };
  }

  const sitemapFound = await checkSitemap(origin);

  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: start, depth: 0 }];
  const pages: CrawledPage[] = [];
  const pageLinks = new Map<string, string[]>(); // url de la página -> enlaces internos encontrados en ella
  const allDiscoveredLinks = new Set<string>();

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const next = queue.shift();
    if (!next) break;
    const { url, depth } = next;
    if (visited.has(url) || !robots.isAllowed(url)) continue;
    visited.add(url);

    const { page, internalLinks } = await fetchAndAnalyzePage(url, origin);
    pages.push(page);
    pageLinks.set(url, internalLinks);
    internalLinks.forEach((l) => allDiscoveredLinks.add(l));

    if (depth < MAX_DEPTH) {
      for (const link of internalLinks) {
        if (!visited.has(link) && !queue.some((q) => q.url === link)) {
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    }

    await sleep(PAGE_DELAY_MS);
  }

  // Resuelve el estado de los enlaces descubiertos que no se rastrearon como
  // página propia (fuera del presupuesto de páginas/profundidad) — ahí es
  // donde suelen esconderse los enlaces rotos reales.
  const linkStatus = new Map<string, number | null>();
  for (const page of pages) linkStatus.set(page.url, page.statusCode);

  const toCheck = [...allDiscoveredLinks]
    .filter((l) => !linkStatus.has(l))
    .slice(0, EXTRA_LINK_CHECK_CAP);

  for (const link of toCheck) {
    linkStatus.set(link, await checkLinkStatus(link));
    await sleep(LINK_CHECK_DELAY_MS);
  }

  // Con el estado de los enlaces resueltos, calcula rotos por página de
  // origen. Un enlace sin entrada en linkStatus no se comprobó (superó
  // EXTRA_LINK_CHECK_CAP) — no cuenta ni como roto ni como comprobado.
  for (const page of pages) {
    const links = pageLinks.get(page.url) ?? [];
    const checked = links.filter((l) => linkStatus.has(l));
    const broken = checked.filter((l) => {
      const status = linkStatus.get(l);
      return status === null || (status !== undefined && status >= 400);
    });
    page.linksCheckedCount = checked.length;
    page.brokenLinksCount = broken.length;
    page.brokenLinksSample = broken.slice(0, MAX_BROKEN_SAMPLE);
  }

  return { pages, robotsBlocked: false, sitemapFound };
}
