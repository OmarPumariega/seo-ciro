import { postTask } from "@/lib/dataforseo/client";
import { normalizeDomain } from "@/lib/rank/serp";

// Backlinks (enlazado externo) — Tier 3, API de Backlinks de DataForSEO,
// producto separado del ya integrado (Labs/SERP/Keywords Data/Maps): esto
// SÍ es gasto nuevo, no reutiliza ninguna llamada ya pagada. Dos endpoints
// (MVP, coste controlado):
//   • backlinks/summary/live   → autoridad del dominio + totales agregados
//   • backlinks/backlinks/live → top backlinks individuales (origen + autoridad
//     de quien enlaza + anchor), limitado y ordenado por autoridad del
//     dominio de origen
//
// Mismo principio que el resto: nada se inventa, todo viene de la respuesta
// real. El coste (tasks[0].cost) se devuelve para registrarlo en ApiUsageLog.

export type BacklinkSummary = {
  rank: number | null; // "Domain Rank" DataForSEO, 0-1000
  backlinksTotal: number | null;
  referringDomains: number | null;
  referringMainDomains: number | null;
  dofollowBacklinks: number | null;
  nofollowBacklinks: number | null;
  brokenBacklinks: number | null;
};

// TODOS los campos que devuelve el item de /v3/backlinks/backlinks/live —
// antes solo se guardaban 6 y el resto se descartaba pese a llegar ya en la
// misma respuesta pagada. Nada se inventa: lo que la API no da, queda null.
export type TopBacklink = {
  urlFrom: string | null;
  urlFromHttps: boolean | null;
  domainFrom: string | null;
  domainFromRank: number | null; // autoridad del DOMINIO de origen, 0-1000
  pageFromRank: number | null; // autoridad de la PÁGINA de origen, 0-1000
  domainFromPlatformType: string[] | null;
  domainFromIsIp: boolean | null;
  urlTo: string | null; // página propia/del competidor que recibe el enlace
  domainTo: string | null;
  tldFrom: string | null;
  anchor: string | null;
  dofollow: boolean | null;
  textPre: string | null;
  textPost: string | null;
  semanticLocation: string | null;
  linksCount: number | null;
  groupCount: number | null;
  isNew: boolean | null;
  isLost: boolean | null;
  isBroken: boolean | null;
  isIndirectLink: boolean | null;
  urlToStatusCode: number | null;
  backlinkSpamScore: number | null;
  pageFromExternalLinks: number | null;
  pageFromInternalLinks: number | null;
  pageFromSize: number | null;
  pageFromEncoding: string | null;
  pageFromLanguage: string | null;
  pageFromTitle: string | null;
  firstSeen: string | null;
  prevSeen: string | null;
  lastSeen: string | null;
  itemType: string | null;
};

type SummaryItem = {
  rank?: number;
  backlinks?: number;
  referring_domains?: number;
  referring_main_domains?: number;
  referring_domains_nofollow?: number;
  backlinks_spam_score?: number;
  broken_backlinks?: number;
  backlinks_nofollow?: number;
};

type BacklinkItem = {
  url_from?: string;
  url_from_https?: boolean;
  domain_from?: string;
  domain_from_rank?: number;
  page_from_rank?: number;
  domain_from_platform_type?: string[];
  domain_from_is_ip?: boolean;
  url_to?: string;
  domain_to?: string;
  tld_from?: string;
  anchor?: string;
  dofollow?: boolean;
  text_pre?: string;
  text_post?: string;
  semantic_location?: string;
  links_count?: number;
  group_count?: number;
  is_new?: boolean;
  is_lost?: boolean;
  is_broken?: boolean;
  is_indirect_link?: boolean;
  url_to_status_code?: number;
  backlink_spam_score?: number;
  page_from_external_links?: number;
  page_from_internal_links?: number;
  page_from_size?: number;
  page_from_encoding?: string;
  page_from_language?: string;
  page_from_title?: string;
  first_seen?: string;
  prev_seen?: string;
  last_seen?: string;
  item_type?: string;
};

export async function fetchBacklinkSummary(
  domain: string
): Promise<{ data: BacklinkSummary; costUsd: number | null }> {
  const task = await postTask(
    "/v3/backlinks/summary/live",
    { target: domain, internal_list_limit: 10, backlinks_status_type: "live" },
    "backlinks.summary"
  );
  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const item = (resultArr[0] ?? {}) as SummaryItem;

  const dofollow =
    typeof item.backlinks === "number" && typeof item.backlinks_nofollow === "number"
      ? item.backlinks - item.backlinks_nofollow
      : null;

  return {
    data: {
      rank: typeof item.rank === "number" ? item.rank : null,
      backlinksTotal: typeof item.backlinks === "number" ? item.backlinks : null,
      referringDomains: typeof item.referring_domains === "number" ? item.referring_domains : null,
      referringMainDomains:
        typeof item.referring_main_domains === "number" ? item.referring_main_domains : null,
      dofollowBacklinks: dofollow,
      nofollowBacklinks: typeof item.backlinks_nofollow === "number" ? item.backlinks_nofollow : null,
      brokenBacklinks: typeof item.broken_backlinks === "number" ? item.broken_backlinks : null,
    },
    costUsd: typeof task.cost === "number" ? task.cost : null,
  };
}

// Máximo real de items por petición a /v3/backlinks/backlinks/live — DataForSEO
// no lo documenta con un número fijo garantizado, así que se trata como una
// asunción razonable (no verificada contra la documentación oficial) hasta
// confirmarlo: si algún día resulta ser distinto, solo hay que ajustar esta
// constante, la paginación de fetchAllBacklinks ya está preparada para ello.
export const BACKLINKS_MAX_PER_REQUEST = 1000;

function mapBacklinkItem(it: BacklinkItem): TopBacklink {
  return {
    urlFrom: typeof it.url_from === "string" ? it.url_from : null,
    urlFromHttps: typeof it.url_from_https === "boolean" ? it.url_from_https : null,
    domainFrom: typeof it.domain_from === "string" ? it.domain_from : null,
    domainFromRank: typeof it.domain_from_rank === "number" ? it.domain_from_rank : null,
    pageFromRank: typeof it.page_from_rank === "number" ? it.page_from_rank : null,
    domainFromPlatformType: Array.isArray(it.domain_from_platform_type) ? it.domain_from_platform_type : null,
    domainFromIsIp: typeof it.domain_from_is_ip === "boolean" ? it.domain_from_is_ip : null,
    urlTo: typeof it.url_to === "string" ? it.url_to : null,
    domainTo: typeof it.domain_to === "string" ? it.domain_to : null,
    tldFrom: typeof it.tld_from === "string" ? it.tld_from : null,
    anchor: typeof it.anchor === "string" ? it.anchor : null,
    dofollow: typeof it.dofollow === "boolean" ? it.dofollow : null,
    textPre: typeof it.text_pre === "string" ? it.text_pre : null,
    textPost: typeof it.text_post === "string" ? it.text_post : null,
    semanticLocation: typeof it.semantic_location === "string" ? it.semantic_location : null,
    linksCount: typeof it.links_count === "number" ? it.links_count : null,
    groupCount: typeof it.group_count === "number" ? it.group_count : null,
    isNew: typeof it.is_new === "boolean" ? it.is_new : null,
    isLost: typeof it.is_lost === "boolean" ? it.is_lost : null,
    isBroken: typeof it.is_broken === "boolean" ? it.is_broken : null,
    isIndirectLink: typeof it.is_indirect_link === "boolean" ? it.is_indirect_link : null,
    urlToStatusCode: typeof it.url_to_status_code === "number" ? it.url_to_status_code : null,
    backlinkSpamScore: typeof it.backlink_spam_score === "number" ? it.backlink_spam_score : null,
    pageFromExternalLinks: typeof it.page_from_external_links === "number" ? it.page_from_external_links : null,
    pageFromInternalLinks: typeof it.page_from_internal_links === "number" ? it.page_from_internal_links : null,
    pageFromSize: typeof it.page_from_size === "number" ? it.page_from_size : null,
    pageFromEncoding: typeof it.page_from_encoding === "string" ? it.page_from_encoding : null,
    pageFromLanguage: typeof it.page_from_language === "string" ? it.page_from_language : null,
    pageFromTitle: typeof it.page_from_title === "string" ? it.page_from_title : null,
    firstSeen: typeof it.first_seen === "string" ? it.first_seen : null,
    prevSeen: typeof it.prev_seen === "string" ? it.prev_seen : null,
    lastSeen: typeof it.last_seen === "string" ? it.last_seen : null,
    itemType: typeof it.item_type === "string" ? it.item_type : null,
  };
}

export async function fetchTopBacklinks(
  domain: string,
  limit: number,
  offset = 0
): Promise<{ items: TopBacklink[]; costUsd: number | null }> {
  const task = await postTask(
    "/v3/backlinks/backlinks/live",
    {
      target: domain,
      mode: "as_is",
      order_by: ["domain_from_rank,desc"],
      limit,
      offset,
      backlinks_status_type: "live",
    },
    "backlinks.top"
  );
  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const resultObj = resultArr[0] ?? {};
  const rawItems = Array.isArray((resultObj as Record<string, unknown>).items)
    ? ((resultObj as Record<string, unknown>).items as BacklinkItem[])
    : [];

  return { items: rawItems.map(mapBacklinkItem), costUsd: typeof task.cost === "number" ? task.cost : null };
}

// Tope de páginas por seguridad para el modo "Todos" (ver analizar/route.ts,
// que hace la paginación real y re-comprueba el tope de gasto antes de cada
// página) — un dominio con cientos de miles de backlinks no debe poder
// generar cientos de peticiones sin control aunque el spend-limit del
// proyecto fuera muy alto.
export const BACKLINKS_MAX_PAGES_SAFETY = 50;

export { normalizeDomain };
