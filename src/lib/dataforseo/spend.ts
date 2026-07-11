import { prisma } from "@/lib/db/prisma";

// Tope de gasto mensual global de DataForSEO (sección 5 del spec: "topes de
// gasto configurables, con opción de bloquear nuevas llamadas al superarlo").
// Se controla con la variable de entorno DATAFORSEO_MONTHLY_LIMIT_USD; si no
// está definida, no hay tope (uso ilimitado). El cómputo suma el coste real
// registrado en ApiUsageLog (api='dataforseo') del mes natural en curso.

export class DataForSeoSpendLimitError extends Error {
  readonly spentUsd: number;
  readonly limitUsd: number;
  constructor(spentUsd: number, limitUsd: number) {
    super(
      `Tope mensual de DataForSEO alcanzado: ${spentUsd.toFixed(2)}$ de ${limitUsd.toFixed(2)}$ configurados. Sube DATAFORSEO_MONTHLY_LIMIT_USD o espera al próximo mes para nuevas llamadas.`
    );
    this.name = "DataForSeoSpendLimitError";
    this.spentUsd = spentUsd;
    this.limitUsd = limitUsd;
  }
}

export function getMonthlyLimitUsd(): number | null {
  const raw = process.env.DATAFORSEO_MONTHLY_LIMIT_USD;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Coste real acumulado en el mes natural en curso (día 1 hasta ahora).
export async function getMonthSpendUsd(): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const agg = await prisma.apiUsageLog.aggregate({
    where: { api: "dataforseo", createdAt: { gte: startOfMonth } },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ? Number(agg._sum.costUsd) : 0;
}

// Lanza DataForSeoSpendLimitError si el gasto del mes ya alcanzó el tope.
// Llamar ANTES de cualquier llamada nueva a DataForSEO (no bloquea lecturas
// de caché, que no gastan). Si no hay tope configurado, no hace nada.
export async function assertWithinSpendLimit(): Promise<void> {
  const limit = getMonthlyLimitUsd();
  if (limit === null) return;
  const spent = await getMonthSpendUsd();
  if (spent >= limit) {
    throw new DataForSeoSpendLimitError(spent, limit);
  }
}
