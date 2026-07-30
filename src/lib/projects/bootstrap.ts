import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  DataForSeoError,
} from "@/lib/dataforseo/client";
import {
  DataForSeoSpendLimitError,
} from "@/lib/dataforseo/spend";
import { normalizeDomain } from "@/lib/competitors/dataforseo";
import {
  analyzeCompetitorVisibility,
  computeCompetitorContentGap,
  isVisibilityFresh,
  isContentGapFresh,
} from "@/lib/competitors/analyze";
import { checkRankKeyword } from "@/lib/rank/check";
import {
  COMPETITORS_ANALYZE_DEFAULT_LIMIT,
  COMPETITORS_GAP_DEFAULT_LIMIT,
  competitorAnalysisCostUsd,
  contentGapCostUsd,
  rankCheckCostUsd,
} from "@/lib/dataforseo/pricing";
import { resolveLocationName } from "@/lib/rank/locations";

// Orquestador del "lanzamiento completo" de un proyecto. Vincula las piezas
// que el wizard de alta creó por separado (estudio de keywords, competidores)
// con los módulos que consumen de verdad esa información (Rank Tracking,
// TF-IDF, análisis de visibilidad + content gap).
//
// El wizard actual solo persiste el estudio (Módulo 1) y los dominios
// competidores, pero NO los procesa: el rank tracking queda vacío, el TF-IDF
// nunca se dispara y los competidores se quedan sin snapshot. Esta función
// cierra esa brecha — se llama desde el paso "Lanzar" del wizard y desde el
// botón "Re-procesar proyecto" de la ficha.
//
// Es parcialmente idempotente: si se cae a mitad por tope de gasto o error,
// lo hecho queda hecho (RankKeyword creadas, VisibilitySnapshots persistidos,
// TfidfResults guardados) y una segunda invocación continúa desde donde
// faltaba sin duplicar nada (la clave única de RankKeyword + el upsert de
// TfidfResult lo garantizan).

export type BootstrapStep = "keywords" | "tfidf" | "competitors" | "contentgap";

export type BootstrapError = {
  step: BootstrapStep;
  ref: string; // keyword o dominio afecto
  message: string;
};

export type BootstrapResult = {
  keywordsImported: number;
  keywordsReplaced: number;
  keywordsChecked: number;
  tfidfGenerated: number;
  competitorsAnalyzed: number;
  contentGapsCalculated: number;
  errors: BootstrapError[];
  spendLimitHit: boolean;
};

const DEFAULT_DEPTH = 30;
const DEFAULT_FREQUENCY = "weekly";
const DEFAULT_DEVICE = "desktop";

// Calcula el coste estimado de ejecutar el bootstrap ahora. Mismo criterio
// que el resto del sistema: orientativo, para que el usuario sepa cuánto va a
// gastar ANTES de confirmar. El coste real es el que devuelve la API y se
// registra en ApiUsageLog.
export async function estimateBootstrapCost(projectId: string): Promise<{
  keywordsToCheck: number;
  competitorsToAnalyze: number;
  estimatedCostUsd: number;
  missingDomain: boolean;
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { domain: true },
  });
  if (!project) {
    return { keywordsToCheck: 0, competitorsToAnalyze: 0, estimatedCostUsd: 0, missingDomain: true };
  }

  // Keywords en estudios que aún no están en rank tracking (cualquier
  // combinación keyword+ubicación+idioma+device nueva). Simplificación: una
  // keyword del estudio que no esté en RankKeyword del proyecto suma.
  const studies = await prisma.keywordStudy.findMany({
    where: { projectId },
    include: { keywords: { select: { keyword: true } } },
  });
  const studyKeywords = new Set<string>();
  for (const s of studies) for (const k of s.keywords) studyKeywords.add(k.keyword);

  const alreadyTracked = await prisma.rankKeyword.findMany({
    where: { projectId },
    select: { keyword: true },
  });
  const trackedSet = new Set(alreadyTracked.map((k) => k.keyword));

  let keywordsToCheck = 0;
  for (const kw of studyKeywords) if (!trackedSet.has(kw)) keywordsToCheck++;

  // Competidores: solo cuentan los que tienen visibilidad o content-gap
  // desactualizados (>7 días o inexistentes) — mismo criterio de frescura que
  // aplica bootstrapProjectAnalysis más abajo, para que la estimación no diga
  // "hay que pagar" por algo que en realidad va a salir gratis.
  const competitors = await prisma.competitor.findMany({
    where: { projectId },
    select: { domain: true, contentGapAt: true },
  });
  let staleVisibility = 0;
  let staleContentGap = 0;
  for (const c of competitors) {
    if (!(await isVisibilityFresh(projectId, c.domain))) staleVisibility++;
    if (!isContentGapFresh(c.contentGapAt)) staleContentGap++;
  }

  const rankCost = keywordsToCheck * rankCheckCostUsd(DEFAULT_DEPTH);
  const competitorCost = staleVisibility * competitorAnalysisCostUsd() + staleContentGap * contentGapCostUsd();

  return {
    keywordsToCheck,
    competitorsToAnalyze: Math.max(staleVisibility, staleContentGap),
    estimatedCostUsd: Math.round((rankCost + competitorCost) * 100) / 100,
    missingDomain: !project.domain,
  };
}

export async function bootstrapProjectAnalysis(projectId: string): Promise<BootstrapResult> {
  const result: BootstrapResult = {
    keywordsImported: 0,
    keywordsReplaced: 0,
    keywordsChecked: 0,
    tfidfGenerated: 0,
    competitorsAnalyzed: 0,
    contentGapsCalculated: 0,
    errors: [],
    spendLimitHit: false,
  };

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Proyecto no encontrado");
  if (!project.domain) {
    throw new Error(
      "El proyecto no tiene dominio configurado. Añádelo en la ficha del proyecto antes de lanzar el análisis."
    );
  }

  // ---- 1) Keywords: importar de estudios + chequeo + TF-IDF ----
  const studies = await prisma.keywordStudy.findMany({
    where: { projectId },
    include: { keywords: true },
  });

  // Pre-carga lo ya seguido para dedupe sin N queries.
  const alreadyTracked = await prisma.rankKeyword.findMany({
    where: { projectId },
    select: { id: true, keyword: true, locationCode: true, languageCode: true, device: true },
  });
  const trackedKey = (k: string, loc: number, lang: string, dev: string) =>
    `${k}|${loc}|${lang}|${dev}`;
  const trackedSet = new Set(
    alreadyTracked.map((r) => trackedKey(r.keyword, r.locationCode, r.languageCode, r.device))
  );

  // Limpieza de keywords "mal configuradas" de lanzamientos previos: si una
  // keyword del estudio ya existe en RankKeyword pero con OTRA ubicación
  // (p.ej. 2724 España nacional cuando el estudio ahora es Oviedo), la
  // borramos y recreamos con la del estudio — SIEMPRE que no tenga histórico
  // de posiciones. Esto arregla el caso típico: el usuario dio de alta el
  // proyecto sin seleccionar Oviedo en el wizard, lanzó el análisis, vio
  // "Nacional" en Rank Tracking, editó el estudio para poner Oviedo y
  // relanzó — sin este paso, las keywords viejas seguirían con 2724 para
  // siempre y la nueva ubicación nunca se aplicaría.
  let keywordsReplaced = 0;
  for (const study of studies) {
    const studyKeywordSet = new Set(study.keywords.map((k) => k.keyword));
    for (const rk of alreadyTracked) {
      if (
        rk.keyword &&
        studyKeywordSet.has(rk.keyword) &&
        (rk.locationCode !== study.locationCode ||
          rk.languageCode !== study.languageCode ||
          rk.device !== DEFAULT_DEVICE)
      ) {
        // Solo borramos si no hay histórico — nunca destruimos posiciones
        // ya medidas, aunque estén con la ubicación vieja.
        const positions = await prisma.rankPosition.count({ where: { rankKeywordId: rk.id } });
        if (positions === 0) {
          await prisma.rankKeyword.delete({ where: { id: rk.id } });
          // Quita del trackedSet la entrada vieja para que el bloque de
          // abajo la recree con la ubicación nueva.
          trackedSet.delete(
            trackedKey(rk.keyword, rk.locationCode, rk.languageCode, rk.device)
          );
          keywordsReplaced++;
        }
      }
    }
  }
  result.keywordsReplaced = keywordsReplaced;

  let spendHitKeywords = false;

  for (const study of studies) {
    if (spendHitKeywords) break;
    const group = study.name.slice(0, 60) || "Bootstrap";
    for (const k of study.keywords) {
      const key = trackedKey(k.keyword, study.locationCode, study.languageCode, DEFAULT_DEVICE);
      let rankKeywordId: string | null = null;

      if (!trackedSet.has(key)) {
        try {
          // Resolvemos el nombre legible de la ubicación (p.ej. "Oviedo,...")
          // desde el JSON estático — sin esto, el RankKeyword se crearía con
          // locationName=null y la UI mostraría "Nacional" aunque el
          // locationCode sea correcto.
          const locationName = resolveLocationName(study.locationCode);
          const created = await prisma.rankKeyword.create({
            data: {
              projectId,
              keyword: k.keyword,
              locationCode: study.locationCode,
              languageCode: study.languageCode,
              device: DEFAULT_DEVICE,
              frequency: DEFAULT_FREQUENCY,
              depth: DEFAULT_DEPTH,
              group,
              locationName,
            },
          });
          rankKeywordId = created.id;
          trackedSet.add(key);
          result.keywordsImported++;
        } catch (error) {
          // P2002 = ya existe (race). Tratamos de localizarla para igualmente chequear.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const existing = await prisma.rankKeyword.findFirst({
              where: {
                projectId,
                keyword: k.keyword,
                locationCode: study.locationCode,
                languageCode: study.languageCode,
                device: DEFAULT_DEVICE,
              },
              select: { id: true },
            });
            rankKeywordId = existing?.id ?? null;
          } else {
            result.errors.push({
              step: "keywords",
              ref: k.keyword,
              message: error instanceof Error ? error.message : "Error al importar la keyword",
            });
            continue;
          }
        }
      } else {
        // Ya seguida: localizamos para chequearla también (refresco).
        const existing = await prisma.rankKeyword.findFirst({
          where: {
            projectId,
            keyword: k.keyword,
            locationCode: study.locationCode,
            languageCode: study.languageCode,
            device: DEFAULT_DEVICE,
          },
          select: { id: true, lastPosition: true, lastCheckedAt: true },
        });
        rankKeywordId = existing?.id ?? null;
        // Optimización: si la keyword ya tiene posición Y se chequeó hace
        // menos de 1h, la saltamos (no tiene sentido volver a pagar una
        // llamada SERP para el mismo dato). Si lastPosition es null (el
        // chequeo anterior falló, p.ej. por 40101 antes del retry) o si hace
        // más de 1h, la re-chequeamos para que el "Lanzar análisis" sea
        // efectivo como acción de remedio.
        if (existing && existing.lastPosition !== null && existing.lastCheckedAt) {
          const oneHourAgo = Date.now() - 60 * 60 * 1000;
          if (existing.lastCheckedAt.getTime() > oneHourAgo) {
            continue;
          }
        }
      }

      if (!rankKeywordId) continue;

      // Chequeo síncrono (consume SERP API). Si el tope salta, marcamos y
      // dejamos de procesar más keywords — pero seguimos con competidores
      // (sus llamadas Labs son independientes y la misma limitad puede no
      // haberse tocado todavía desde ese flujo). En la práctica, cuando el
      // tope cae, todas las llamadas subsiguientes lo cumplen; por eso
      // respetamos la señal también para competidores.
      try {
        const checked = await checkRankKeyword(rankKeywordId);
        result.keywordsChecked++;
        // El TF-IDF lo dispara checkRankKeyword internamente (aprovechando el
        // SERP recién pagado y ya cacheado), por eso no se invoca aquí. Solo
        // cuenta como generado cuando el chequeo fue REAL (no cacheado del
        // día): un chequeo cacheado no trae SERP nuevo y, por tanto, no
        // re-dispara el scraping del TF-IDF.
        if (!checked.fromCache) result.tfidfGenerated++;
      } catch (error) {
        if (error instanceof DataForSeoSpendLimitError) {
          result.spendLimitHit = true;
          spendHitKeywords = true;
          result.errors.push({
            step: "keywords",
            ref: k.keyword,
            message: error.message,
          });
          break;
        }
        result.errors.push({
          step: "keywords",
          ref: k.keyword,
          message:
            error instanceof DataForSeoError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Error al comprobar la posición",
        });
      }
    }
  }

  // ---- 2) Competidores: visibilidad + content gap ----
  // Usamos la ubicación e idioma del estudio con más keywords del proyecto
  // (un proyecto puede tener varios estudios, cada uno con su ubicación —
  // antes estaba hardcoded a España nacional 2724, lo que ignoraba por
  // completo la ubicación elegida en el wizard y always analizaba a nivel
  // país, aunque el cliente fuera un negocio local de Oviedo).
  const competitors = await prisma.competitor.findMany({ where: { projectId } });
  const projectDomain = normalizeDomain(project.domain);
  const primaryStudy = studies.slice().sort((a, b) => b.keywords.length - a.keywords.length)[0];
  const competitorLocationCode = primaryStudy?.locationCode ?? 2724;
  const competitorLanguageCode = primaryStudy?.languageCode ?? "es";

  for (const c of competitors) {
    if (result.spendLimitHit) break;

    // Visibilidad + top keywords — gratis si ya hay un VisibilitySnapshot de
    // hace menos de 7 días para este dominio (analyzeCompetitorVisibility),
    // así que relanzar el bootstrap varias veces no vuelve a pagar por
    // competidores ya analizados recientemente.
    try {
      await analyzeCompetitorVisibility(projectId, c.domain, {
        locationCode: competitorLocationCode,
        languageCode: competitorLanguageCode,
        limit: COMPETITORS_ANALYZE_DEFAULT_LIMIT,
      });
      result.competitorsAnalyzed++;
    } catch (error) {
      if (error instanceof DataForSeoSpendLimitError) {
        result.spendLimitHit = true;
        result.errors.push({ step: "competitors", ref: c.domain, message: error.message });
        break;
      }
      result.errors.push({
        step: "competitors",
        ref: c.domain,
        message:
          error instanceof DataForSeoError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Error al analizar el competidor",
      });
      continue; // con el content gap no seguimos si el análisis falló
    }

    // Content gap — mismo criterio de frescura de 7 días vía
    // computeCompetitorContentGap.
    try {
      await computeCompetitorContentGap(projectId, c, projectDomain, {
        locationCode: competitorLocationCode,
        languageCode: competitorLanguageCode,
        limit: COMPETITORS_GAP_DEFAULT_LIMIT,
      });
      result.contentGapsCalculated++;
    } catch (error) {
      if (error instanceof DataForSeoSpendLimitError) {
        result.spendLimitHit = true;
        result.errors.push({ step: "contentgap", ref: c.domain, message: error.message });
        break;
      }
      result.errors.push({
        step: "contentgap",
        ref: c.domain,
        message:
          error instanceof DataForSeoError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Error al calcular el content gap",
      });
    }
  }

  return result;
}
