import * as cheerio from "cheerio";
import { loadRobotsRules, CRAWLER_USER_AGENT } from "@/lib/audit/robots";
import { normalizeUrl } from "@/lib/seo/normalize-url";

// Techo de seguridad para "rastrear el sitio entero" (tipo Screaming Frog),
// no un límite pensado para recortar de partida — un sitio de agencia normal
// nunca lo alcanza. Si lo alcanza, `truncated: true` en el resultado avisa de
// que puede haber más páginas sin analizar.
const MAX_PAGES = 5000;
// Red barata contra trampas de profundidad real (calendarios, facetados por
// enlace) — con MAX_PAGES como freno principal y la normalización de URL ya
// deduplicando bien, esto casi nunca se alcanza en un sitio normal (rara vez
// pasan de 6-8 niveles).
const MAX_DEPTH = 20;
const PAGE_TIMEOUT_MS = 10000;
const PAGE_DELAY_MS = 400;
// Concurrency control: rastrea varias páginas en paralelo para no sumar
// secuencialmente la latencia de cada fetch. 4 peticiones simultáneas es
// conservador — un navegador hace 6+ por origen. Aplicado por lotes: se
// esperan todas las del lote antes de añadir sus enlaces a la cola (mantiene
// el orden BFS y la deduplicación del visited/queue).
const CRAWL_CONCURRENCY = 4;
// Con MAX_PAGES cubriendo ya "el sitio entero" en el caso normal, esto solo
// importa cuando el crawl se trunca — sigue acotado para no martillear
// indefinidamente un sitio con decenas de miles de enlaces salientes rotos.
const EXTRA_LINK_CHECK_CAP = 2000;
// Sitemaps índice (habituales en WordPress/Yoast/RankMath) apuntan a
// sub-sitemaps en vez de páginas — sin seguirlos, la siembra por sitemap no
// funcionaría en la mayoría de sitios reales.
const MAX_SITEMAP_INDEX_FOLLOW = 20;
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
  // Checks nuevos sobre datos que ya se descargan (HTML/cabeceras HTTP ya
  // obtenidos), antes ni se miraban:
  // Cabecera HTTP que puede desindexar la página aunque el meta robots en
  // HTML diga lo contrario — hueco real de indexabilidad.
  xRobotsTag: string | null;
  // Nº de <link rel="alternate" hreflang="..."> — señal de SEO internacional.
  hreflangCount: number;
  // Presencia de datos estructurados (JSON-LD) y qué tipos schema.org declara.
  hasStructuredData: boolean;
  structuredDataTypes: string[];
  // Presencia de Open Graph (afecta la apariencia al compartir en redes).
  hasOpenGraph: boolean;
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
  // true si el crawl alcanzó MAX_PAGES sin agotar la cola — puede haber más
  // páginas del sitio sin analizar.
  truncated: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    xRobotsTag: null,
    hreflangCount: 0,
    hasStructuredData: false,
    structuredDataTypes: [],
    hasOpenGraph: false,
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

  // Identidad del nodo = URL final tras redirect, no la solicitada — evita
  // entradas fantasma en el linkGraph y de paso unifica http/https cuando el
  // servidor redirige de uno a otro.
  base.url = normalizeUrl(res.url) ?? url;
  base.statusCode = res.status;
  base.isRedirect = res.redirected; // fetch sigue la redirección; esto marca que hubo 3xx
  base.xRobotsTag = res.headers.get("x-robots-tag");

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

  base.hreflangCount = $('link[rel="alternate"][hreflang]').length;
  base.hasOpenGraph = $('meta[property^="og:"]').length > 0;

  const structuredDataTypes = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const type = (node as Record<string, unknown>)?.["@type"];
        if (typeof type === "string") structuredDataTypes.add(type);
        else if (Array.isArray(type)) type.forEach((t) => typeof t === "string" && structuredDataTypes.add(t));
      }
    } catch {
      // JSON-LD mal formado: cuenta como "tiene structured data" (hay un
      // intento) pero sin tipo resoluble — no se rompe el resto del crawl.
    }
  });
  base.hasStructuredData = $('script[type="application/ld+json"]').length > 0;
  base.structuredDataTypes = [...structuredDataTypes];

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
  if (!start) return { pages: [], robotsBlocked: false, sitemapFound: false, robotsContent: null, sitemapUrlCount: null, sitemapUrls: [], linkGraph: [], truncated: false };

  const origin = new URL(start).origin;
  const robots = await loadRobotsRules(origin);

  // robots.txt contenido (para mostrar las reglas en la UI).
  const robotsContent = await fetchRobotsContent(origin).catch(() => null);

  if (!robots.isAllowed(start)) {
    return { pages: [], robotsBlocked: true, sitemapFound: false, robotsContent, sitemapUrlCount: null, sitemapUrls: [], linkGraph: [], truncated: false };
  }

  const sitemapFound = await checkSitemap(origin);
  // Sitemap detallado: parsear URLs (sigue índices de sitemap si los hay).
  // `urls` aquí es la lista COMPLETA (para sembrar la cola), no la muestra.
  const sitemapData = sitemapFound
    ? await parseSitemap(origin).catch(() => ({ count: null, urls: [] as string[] }))
    : { count: null, urls: [] as string[] };

  const visited = new Set<string>(); // marca "ya dequeuado/procesado", NO "ya en cola" — ver dedupe de queue.some() abajo
  const queue: { url: string; depth: number }[] = [{ url: start, depth: 0 }];
  const pages: CrawledPage[] = [];
  const pageLinks = new Map<string, string[]>(); // url de la página -> enlaces internos encontrados en ella
  const allDiscoveredLinks = new Set<string>();

  // Siembra con el sitemap: además de descubrir por enlaces, encola de
  // partida las URLs propias del sitio que trae el sitemap.xml — cubre
  // páginas huérfanas de navegación pero presentes en el sitemap. Llegan a
  // profundidad 0 (no hay razón para penalizarlas, vienen "gratis").
  for (const raw of sitemapData.urls) {
    const normalized = normalizeUrl(raw);
    if (!normalized) continue;
    if (new URL(normalized).origin !== origin) continue;
    if (normalized === start) continue;
    if (queue.some((q) => q.url === normalized)) continue;
    queue.push({ url: normalized, depth: 0 });
  }

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
      const { depth } = batch[i];
      // Identidad del nodo = URL final tras redirect (page.url), no la
      // solicitada — si otra URL de la cola ya convergió en la misma página
      // final, no se duplica el nodo en pages/linkGraph (pero sus enlaces
      // igualmente sirven para seguir descubriendo).
      if (!pageLinks.has(page.url)) {
        pages.push(page);
        pageLinks.set(page.url, internalLinks);
      }
      visited.add(page.url);
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

  return {
    pages,
    robotsBlocked: false,
    sitemapFound,
    robotsContent,
    sitemapUrlCount: sitemapData.count,
    sitemapUrls: sitemapData.urls.slice(0, 100), // muestra para la UI — la lista completa ya se usó arriba para sembrar la cola
    linkGraph: pages.map((p) => ({ url: p.url, links: pageLinks.get(p.url) ?? [] })),
    truncated: pages.length >= MAX_PAGES,
  };
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

async function fetchSitemapXml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Parse del sitemap.xml: devuelve la lista COMPLETA de URLs de página (para
// sembrar la cola de crawl) — el llamador decide si recorta a una muestra
// para mostrar en la UI. Sigue sitemapindex (WordPress/Yoast/RankMath sirven
// casi siempre un índice, no un urlset directo) hasta MAX_SITEMAP_INDEX_FOLLOW
// sub-sitemaps; sin esto, la siembra devolvería URLs de sub-sitemaps XML en
// vez de páginas reales.
async function parseSitemap(origin: string): Promise<{ count: number; urls: string[] }> {
  const rootXml = await fetchSitemapXml(`${origin}/sitemap.xml`);
  if (!rootXml) return { count: 0, urls: [] };

  const $root = cheerio.load(rootXml, { xml: true });
  const isIndex = $root("sitemapindex").length > 0;

  if (!isIndex) {
    const urls: string[] = [];
    $root("url > loc").each((_, el) => {
      const loc = $root(el).text().trim();
      if (loc) urls.push(loc);
    });
    // Fallback por si el sitemap no usa el namespace esperado y `url > loc`
    // no matchea nada: cualquier <loc> suelto.
    if (urls.length === 0) {
      $root("loc").each((_, el) => {
        const loc = $root(el).text().trim();
        if (loc) urls.push(loc);
      });
    }
    return { count: urls.length, urls };
  }

  const subSitemapUrls: string[] = [];
  $root("sitemap > loc").each((_, el) => {
    const loc = $root(el).text().trim();
    if (loc) subSitemapUrls.push(loc);
  });

  const allUrls: string[] = [];
  for (const subUrl of subSitemapUrls.slice(0, MAX_SITEMAP_INDEX_FOLLOW)) {
    const subXml = await fetchSitemapXml(subUrl);
    if (!subXml) continue;
    const $sub = cheerio.load(subXml, { xml: true });
    $sub("loc").each((_, el) => {
      const loc = $sub(el).text().trim();
      if (loc) allUrls.push(loc);
    });
  }
  return { count: allUrls.length, urls: allUrls };
}
