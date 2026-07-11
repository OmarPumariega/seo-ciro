import * as cheerio from "cheerio";
import { loadRobotsRules, CRAWLER_USER_AGENT } from "@/lib/audit/robots";

const MAX_PAGES = 50;
const MAX_DEPTH = 4;
const PAGE_TIMEOUT_MS = 10000;
const PAGE_DELAY_MS = 400;
// Concurrency control: rastrea varias páginas en paralelo para no sumar
// secuencialmente la latencia de cada fetch. 4 peticiones simultáneas es
// conservador — un navegador hace 6+ por origen. Aplicado por lotes: se
// esperan todas las del lote antes de añadir sus enlaces a la cola (mantiene
// el orden BFS y la deduplicación del visited/queue).
const CRAWL_CONCURRENCY = 4;
const EXTRA_LINK_CHECK_CAP = 100;
const LINK_CHECK_TIMEOUT_MS = 5000;
const LINK_CHECK_DELAY_MS = 200;
const LINK_CHECK_CONCURRENCY = 5;
const MAX_BROKEN_SAMPLE = 10;

export type CrawledPage = {
  url: string;
  statusCode: number | null;
  isHttps: boolean;
  isRedirect: boolean;
  canonicalUrl: string | null;
  metaRobots: string | null;
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaLength: number | null;
  h1Count: number | null;
  h1Text: string | null;
  imagesTotal: number;
  imagesMissingAlt: number;
  linksCheckedCount: number;
  brokenLinksCount: number;
  brokenLinksSample: string[];
  wordCount: number | null;
  externalLinksCount: number;
  externalDomains: string[];
};

export type CrawlResult = {
  pages: CrawledPage[];
  robotsBlocked: boolean;
  sitemapFound: boolean;
  robotsContent: string | null;
  sitemapUrlCount: number | null;
  sitemapUrls: string[];
  // Grafo de enlaces internos: { url, links: [urls internas] }. Lo usa el
  // módulo de PageRank/enlazado interno. Vacío si robots bloqueó.
  linkGraph: { url: string; links: string[] }[];
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
    isRedirect: false,
    canonicalUrl: null,
    metaRobots: null,
    title: null,
    titleLength: null,
    metaDescription: null,
    metaLength: null,
    h1Count: null,
    h1Text: null,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    linksCheckedCount: 0,
    brokenLinksCount: 0,
    brokenLinksSample: [],
    wordCount: null,
    externalLinksCount: 0,
    externalDomains: [],
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
  base.isRedirect = res.redirected; // fetch sigue la redirección; esto marca que hubo 3xx

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("text/html")) {
    return { page: base, internalLinks: [] };
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // On-page: title, meta description, H1 (lo que Screaming Frog reporta).
  const titleText = $("title").first().text().trim();
  base.title = titleText || null;
  base.titleLength = titleText ? titleText.length : 0;

  const metaDesc = $('meta[name="description"]').attr("content")?.trim();
  base.metaDescription = metaDesc || null;
  base.metaLength = metaDesc ? metaDesc.length : 0;

  const h1s = $("h1");
  base.h1Count = h1s.length;
  base.h1Text = h1s.first().text().trim() || null;

  base.canonicalUrl = $('link[rel="canonical"]').attr("href")?.trim() || null;
  base.metaRobots = $('meta[name="robots"]').attr("content")?.trim() || null;

  // Thin content: cuenta palabras del cuerpo visible (script/style fuera).
  $("script, style, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  base.wordCount = bodyText ? bodyText.split(" ").filter(Boolean).length : 0;

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
    if (resolved && new URL(resolved).origin === origin) {
      internalLinks.push(resolved);
    } else if (resolved) {
      // Enlace externo (distinto dominio) — contar y muestrear dominios.
      base.externalLinksCount++;
      try {
        const domain = new URL(resolved).hostname;
        if (!base.externalDomains.includes(domain) && base.externalDomains.length < 10) {
          base.externalDomains.push(domain);
        }
      } catch {
        // ignore
      }
    }
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
  if (!start) return { pages: [], robotsBlocked: false, sitemapFound: false, robotsContent: null, sitemapUrlCount: null, sitemapUrls: [], linkGraph: [] };

  const origin = new URL(start).origin;
  const robots = await loadRobotsRules(origin);

  // robots.txt contenido (para mostrar las reglas en la UI).
  const robotsContent = await fetchRobotsContent(origin).catch(() => null);

  if (!robots.isAllowed(start)) {
    return { pages: [], robotsBlocked: true, sitemapFound: false, robotsContent, sitemapUrlCount: null, sitemapUrls: [], linkGraph: [] };
  }

  const sitemapFound = await checkSitemap(origin);
  // Sitemap detallado: parsear URLs.
  const sitemapData = sitemapFound ? await parseSitemap(origin).catch(() => ({ count: null, urls: [] as string[] })) : { count: null, urls: [] as string[] };

  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: start, depth: 0 }];
  const pages: CrawledPage[] = [];
  const pageLinks = new Map<string, string[]>(); // url de la página -> enlaces internos encontrados en ella
  const allDiscoveredLinks = new Set<string>();

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    // Construye un lote de hasta CRAWL_CONCURRENCY URLs válidas (no
    // visitadas, permitidas por robots). Se marcan como visitadas aquí para
    // que lotes posteriores no las dupliquen.
    const batch: { url: string; depth: number }[] = [];
    while (
      batch.length < CRAWL_CONCURRENCY &&
      queue.length > 0 &&
      pages.length + batch.length < MAX_PAGES
    ) {
      const next = queue.shift();
      if (!next) break;
      if (visited.has(next.url) || !robots.isAllowed(next.url)) continue;
      visited.add(next.url);
      batch.push(next);
    }
    if (batch.length === 0) continue;

    const results = await Promise.all(
      batch.map((item) => fetchAndAnalyzePage(item.url, origin))
    );

    for (let i = 0; i < results.length; i++) {
      const { page, internalLinks } = results[i];
      const { url, depth } = batch[i];
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

  for (let i = 0; i < toCheck.length; i += LINK_CHECK_CONCURRENCY) {
    const slice = toCheck.slice(i, i + LINK_CHECK_CONCURRENCY);
    const statuses = await Promise.all(slice.map(checkLinkStatus));
    slice.forEach((url, j) => linkStatus.set(url, statuses[j]));
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

  return { pages, robotsBlocked: false, sitemapFound, robotsContent, sitemapUrlCount: sitemapData.count, sitemapUrls: sitemapData.urls, linkGraph: pages.map((p) => ({ url: p.url, links: pageLinks.get(p.url) ?? [] })) };
}

// Fetch del robots.txt en texto plano para mostrar las reglas en la UI.
async function fetchRobotsContent(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Parse del sitemap.xml: cuenta URLs y guarda una muestra (hasta 100).
async function parseSitemap(origin: string): Promise<{ count: number; urls: string[] }> {
  try {
    const res = await fetch(`${origin}/sitemap.xml`, {
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { count: 0, urls: [] };
    const xml = await res.text();
    const $ = cheerio.load(xml, { xml: true });
    const allUrls: string[] = [];
    $("loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) allUrls.push(loc);
    });
    return { count: allUrls.length, urls: allUrls.slice(0, 100) };
  } catch {
    return { count: 0, urls: [] };
  }
}
