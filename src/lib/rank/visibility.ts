import { prisma } from "@/lib/db/prisma";

// Índice de visibilidad del proyecto (0-100): cuánto te acercas, ponderado
// por volumen de búsqueda real, a tener TODAS tus keywords seguidas en la
// posición 1 el mismo día. No es un dato medido — es un modelo transparente
// sobre datos reales (posición real + volumen real de KeywordDataCache),
// igual de auditable que el `priority` del Módulo 1 o el `scoring.ts` de
// Auditoría: fórmula fija y documentada, nunca una caja negra.
//
// La curva de CTR por posición es una referencia pública estándar de la
// industria (no es un dato propio ni medido por nosotros) — sirve para
// ponderar, no para prometer tráfico real.
const CTR_TABLE: Record<number, number> = {
  1: 0.28,
  2: 0.15,
  3: 0.11,
  4: 0.08,
  5: 0.07,
  6: 0.05,
  7: 0.04,
  8: 0.03,
  9: 0.03,
  10: 0.02,
};

export function ctrForPosition(position: number): number {
  if (position in CTR_TABLE) return CTR_TABLE[position];
  if (position <= 20) return 0.015 - ((position - 11) / 9) * 0.01; // 0.015 → 0.005
  return 0.002;
}

export type VisibilityPoint = {
  date: string; // ISO, medianoche del día del chequeo
  index: number; // 0-100
  keywordsWithData: number;
  top3: number; // nº keywords en posición ≤ 3
  top10: number; // ≤ 10
  top20: number; // ≤ 20
  top30: number; // ≤ 30
  avgPosition: number | null; // posición media (null si ninguna con dato)
};

// Serie temporal del índice, opcionalmente acotada a un grupo. Cada punto es
// un día real con al menos un chequeo — nunca se interpola entre fechas sin
// dato, mismo principio que la tabla-calendario.
export async function computeVisibilitySeries(
  projectId: string,
  group?: string
): Promise<VisibilityPoint[]> {
  const keywords = await prisma.rankKeyword.findMany({
    where: { projectId, ...(group ? { group } : {}) },
    select: { id: true, keyword: true, languageCode: true, locationCode: true },
  });
  if (keywords.length === 0) return [];

  const ids = keywords.map((k) => k.id);
  const positions = await prisma.rankPosition.findMany({
    where: { rankKeywordId: { in: ids } },
    select: { rankKeywordId: true, checkedAt: true, position: true },
    orderBy: { checkedAt: "asc" },
  });
  if (positions.length === 0) return [];

  // Volumen real por keyword, leído de la caché del Módulo 1 (sin gastar).
  // Sin volumen conocido → peso 0 (no se fabrica un número).
  // OJO: el objeto del OR debe llevar SOLO estos 3 campos — reutilizar el
  // select completo de RankKeyword (que incluye `id`) coló `id` como
  // condición extra en cada rama del OR contra KeywordDataCache, que tiene
  // su propio `id` distinto, así que nunca coincidía nada (bug real
  // encontrado al verificar: el índice siempre daba 0 pese a haber volumen).
  const pairs = new Map<string, { keyword: string; languageCode: string; locationCode: number }>();
  for (const k of keywords) {
    pairs.set(`${k.keyword}|${k.languageCode}|${k.locationCode}`, {
      keyword: k.keyword,
      languageCode: k.languageCode,
      locationCode: k.locationCode,
    });
  }
  const cacheRows = await prisma.keywordDataCache.findMany({
    where: { OR: [...pairs.values()] },
    select: { keyword: true, languageCode: true, locationCode: true, searchVolume: true },
  });
  const volByKey = new Map<string, number>();
  for (const row of cacheRows) {
    volByKey.set(`${row.keyword}|${row.languageCode}|${row.locationCode}`, row.searchVolume ?? 0);
  }
  const volByKwId = new Map<string, number>();
  for (const k of keywords) {
    volByKwId.set(k.id, volByKey.get(`${k.keyword}|${k.languageCode}|${k.locationCode}`) ?? 0);
  }

  // Un chequeo real por (keyword, día) — si hubo varios ese día, se queda con
  // el último (positions viene ordenado asc por checkedAt).
  const byDay = new Map<string, Map<string, number | null>>();
  for (const p of positions) {
    const day = p.checkedAt.toDateString();
    if (!byDay.has(day)) byDay.set(day, new Map());
    byDay.get(day)!.set(p.rankKeywordId, p.position);
  }

  const series: VisibilityPoint[] = [];
  for (const [day, posMap] of byDay) {
    let weighted = 0;
    let maxForDay = 0;
    let top3 = 0, top10 = 0, top20 = 0, top30 = 0;
    let posSum = 0, posCount = 0;
    for (const [kwId, pos] of posMap) {
      const vol = volByKwId.get(kwId) ?? 0;
      maxForDay += vol * CTR_TABLE[1];
      if (pos !== null) {
        weighted += ctrForPosition(pos) * vol;
        if (pos <= 3) top3++;
        if (pos <= 10) top10++;
        if (pos <= 20) top20++;
        if (pos <= 30) top30++;
        posSum += pos;
        posCount++;
      }
    }
    series.push({
      date: new Date(day).toISOString(),
      index: maxForDay > 0 ? Math.round((weighted / maxForDay) * 10000) / 100 : 0,
      keywordsWithData: posMap.size,
      top3,
      top10,
      top20,
      top30,
      avgPosition: posCount > 0 ? Math.round((posSum / posCount) * 10) / 10 : null,
    });
  }

  return series.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
