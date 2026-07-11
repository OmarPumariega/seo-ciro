import { fetchSearchVolume, fetchSearchIntent, type IntentValue } from "@/lib/keywords/dataforseo";
import { getFreshCache, upsertCache } from "@/lib/keywords/cache";
import { assertWithinSpendLimit } from "@/lib/dataforseo/spend";

// Orquesta la resolución de datos de keyword combinando caché (primera
// fuente, 30 días) y DataForSEO (solo para lo no cacheado).
//
// Regla de coste: agrupa TODAS las keywords pendientes en una sola llamada
// de volumen + una de intención (nunca una llamada por keyword). Si todo
// estaba en caché, no hay ninguna llamada y se devuelven 0 usageLogs — la
// prueba de que el caché funciona de verdad.

export type KeywordDatum = {
  searchVolume: number | null;
  competition: string | null;
  cpc: number | null;
  intent: IntentValue | null;
};

export type UsageLogInput = {
  endpoint: string;
  costUsd: number | null;
};

export async function fetchKeywordData(params: {
  keywords: string[];
  languageCode: string;
  locationCode: number;
}): Promise<{
  data: Map<string, KeywordDatum>;
  usageLogs: UsageLogInput[];
}> {
  const { keywords, languageCode, locationCode } = params;

  const fresh = await getFreshCache(keywords, languageCode, locationCode);
  const pending = keywords.filter((kw) => !fresh.has(kw));

  const data = new Map<string, KeywordDatum>();
  const usageLogs: UsageLogInput[] = [];

  // 1. Todo lo cacheado se reutiliza sin pagar otra vez.
  for (const kw of keywords) {
    const cached = fresh.get(kw);
    if (cached) {
      data.set(kw, {
        searchVolume: cached.searchVolume,
        competition: cached.competition,
        cpc: cached.cpc,
        intent: cached.intent as IntentValue | null,
      });
    }
  }

  if (pending.length === 0) {
    return { data, usageLogs };
  }

  // Tope de gasto: bloquea ANTES de pagar por keywords nuevas. Las cacheadas
  // ya se sirvieron arriba sin coste, así que un estudio 100% cacheado nunca
  // tropieza con el tope (comportamiento correcto: el dato ya se pagó antes).
  await assertWithinSpendLimit();

  // 2. Las pendientes: dos llamadas reales (volumen + intención). Se lanzan
  //    en paralelo — son independientes entre sí.
  const [volume, intent] = await Promise.all([
    fetchSearchVolume(pending, locationCode, languageCode),
    fetchSearchIntent(pending, languageCode),
  ]);

  for (const kw of pending) {
    const vol = volume.byKeyword.get(kw);
    data.set(kw, {
      searchVolume: vol?.searchVolume ?? null,
      competition: vol?.competition ?? null,
      cpc: vol?.cpc ?? null,
      intent: intent.byKeyword.get(kw) ?? null,
    });
  }

  // 3. Cada llamada con coste propio genera su propia fila de ApiUsageLog
  //    (dos llamadas distintas, no una combinada — mismo razonamiento que
  //     Módulo 4 separa modulo4.schema.article de .faq).
  if (volume.costUsd !== null) {
    usageLogs.push({ endpoint: "modulo1.keywords.volumen", costUsd: volume.costUsd });
  }
  if (intent.costUsd !== null) {
    usageLogs.push({ endpoint: "modulo1.keywords.intencion", costUsd: intent.costUsd });
  }

  // 4. Persistir al caché para la próxima vez.
  await upsertCache(pending, data, languageCode, locationCode);

  return { data, usageLogs };
}
