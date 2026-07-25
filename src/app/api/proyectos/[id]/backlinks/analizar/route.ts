import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { DataForSeoSpendLimitError, assertWithinSpendLimit } from "@/lib/dataforseo/spend";
import {
  fetchBacklinkSummary,
  fetchTopBacklinks,
  normalizeDomain,
  BACKLINKS_MAX_PER_REQUEST,
  BACKLINKS_MAX_PAGES_SAFETY,
  type TopBacklink,
} from "@/lib/backlinks/dataforseo";
import { BACKLINKS_LIST_DEFAULT_LIMIT } from "@/lib/dataforseo/pricing";

// Rangos ofrecidos en la UI — "all" pagina hasta cubrir el total real del
// dominio (backlinksTotal del summary), siempre priorizado por autoridad
// (domain_from_rank desc) primero.
const LIMIT_OPTIONS = [20, 50, 100, 200, 500] as const;

// Analiza el perfil de backlinks de un dominio (el del proyecto o un
// competidor). PAGA (summary + backlinks, un producto de DataForSEO aparte
// del resto de la app — ver dataforseo.ts). Crea un BacklinkSnapshot
// (acumula tendencia). Ver los resultados después es gratis (lee el último
// snapshot).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const domain = normalizeDomain(typeof body.domain === "string" ? body.domain : "");
  if (!domain) return NextResponse.json({ error: "Dominio inválido" }, { status: 400 });

  // limit: uno de LIMIT_OPTIONS, o "all" para paginar hasta el total real.
  const wantsAll = body.limit === "all";
  const rawLimit = Number(body.limit);
  const limit =
    !wantsAll && (LIMIT_OPTIONS as readonly number[]).includes(rawLimit) ? rawLimit : BACKLINKS_LIST_DEFAULT_LIMIT;

  try {
    await assertWithinSpendLimit(id);
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }

  try {
    const summary = await fetchBacklinkSummary(domain);
    const costs: { endpoint: string; costUsd: number | null }[] = [
      { endpoint: "backlinks.summary", costUsd: summary.costUsd },
    ];

    let items: TopBacklink[] = [];
    if (wantsAll) {
      // Pagina hasta cubrir backlinksTotal (o el tope de páginas de
      // seguridad), re-comprobando el tope de gasto antes de CADA página —
      // a diferencia de un rango fijo, "todos" puede ser muchas llamadas.
      const total = summary.data.backlinksTotal ?? 0;
      let offset = 0;
      let page = 0;
      while (offset < total && page < BACKLINKS_MAX_PAGES_SAFETY) {
        try {
          await assertWithinSpendLimit(id);
        } catch (error) {
          if (error instanceof DataForSeoSpendLimitError) break; // se corta con lo ya traído, no se pierde
          throw error;
        }
        const pageLimit = Math.min(BACKLINKS_MAX_PER_REQUEST, total - offset);
        const page_ = await fetchTopBacklinks(domain, pageLimit, offset);
        items = items.concat(page_.items);
        costs.push({ endpoint: "backlinks.top", costUsd: page_.costUsd });
        if (page_.items.length === 0) break;
        offset += page_.items.length;
        page++;
      }
    } else {
      const top = await fetchTopBacklinks(domain, limit);
      items = top.items;
      costs.push({ endpoint: "backlinks.top", costUsd: top.costUsd });
    }

    const snapshot = await prisma.backlinkSnapshot.create({
      data: {
        projectId: id,
        domain,
        rank: summary.data.rank,
        backlinksTotal: summary.data.backlinksTotal,
        referringDomains: summary.data.referringDomains,
        referringMainDomains: summary.data.referringMainDomains,
        dofollowBacklinks: summary.data.dofollowBacklinks,
        nofollowBacklinks: summary.data.nofollowBacklinks,
        brokenBacklinks: summary.data.brokenBacklinks,
        topBacklinks: items as unknown as Prisma.InputJsonValue,
      },
    });

    for (const { endpoint, costUsd } of costs) {
      if (costUsd !== null) {
        await prisma.apiUsageLog.create({
          data: { projectId: id, api: "dataforseo", endpoint, model: null, costUsd },
        });
      }
    }

    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
