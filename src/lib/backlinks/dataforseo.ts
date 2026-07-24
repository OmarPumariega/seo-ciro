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

export type TopBacklink = {
  urlFrom: string | null;
  domainFrom: string | null;
  domainFromRank: number | null;
  anchor: string | null;
  dofollow: boolean | null;
  firstSeen: string | null;
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
  domain_from?: string;
  domain_from_rank?: number;
  anchor?: string;
  dofollow?: boolean;
  first_seen?: string;
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

export async function fetchTopBacklinks(
  domain: string,
  limit: number
): Promise<{ items: TopBacklink[]; costUsd: number | null }> {
  const task = await postTask(
    "/v3/backlinks/backlinks/live",
    {
      target: domain,
      mode: "as_is",
      order_by: ["domain_from_rank,desc"],
      limit,
      backlinks_status_type: "live",
    },
    "backlinks.top"
  );
  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const resultObj = resultArr[0] ?? {};
  const rawItems = Array.isArray((resultObj as Record<string, unknown>).items)
    ? ((resultObj as Record<string, unknown>).items as BacklinkItem[])
    : [];

  const items: TopBacklink[] = rawItems.map((it) => ({
    urlFrom: typeof it.url_from === "string" ? it.url_from : null,
    domainFrom: typeof it.domain_from === "string" ? it.domain_from : null,
    domainFromRank: typeof it.domain_from_rank === "number" ? it.domain_from_rank : null,
    anchor: typeof it.anchor === "string" ? it.anchor : null,
    dofollow: typeof it.dofollow === "boolean" ? it.dofollow : null,
    firstSeen: typeof it.first_seen === "string" ? it.first_seen : null,
  }));

  return { items, costUsd: typeof task.cost === "number" ? task.cost : null };
}

export { normalizeDomain };
