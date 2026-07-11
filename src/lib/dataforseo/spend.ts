import { prisma } from "@/lib/db/prisma";

// Tope de gasto mensual global de DataForSEO (sección 5 del spec: "topes de
// gasto configurables, con opción de bloquear nuevas llamadas al superarlo").
// Se controla con la variable de entorno DATAFORSEO_MONTHLY_LIMIT_USD; si no
// está definida, no hay tope (uso ilimitado). El cómputo suma el coste real
// registrado en ApiUsageLog (api='dataforseo') del mes natural en curso.

export class DataForSeoSpendLimitError extends Error {
  readonly spentUsd: number;
  readonly limitUsd: number;
  readonly scope: string;
  constructor(spentUsd: number, limitUsd: number, scope: string = "global") {
    super(
      scope === "global"
        ? `Tope mensual de DataForSEO alcanzado: ${spentUsd.toFixed(2)}$ de ${limitUsd.toFixed(2)}$ configurados. Sube DATAFORSEO_MONTHLY_LIMIT_USD o espera al próximo mes para nuevas llamadas.`
        : `Tope de gasto del proyecto alcanzado: ${spentUsd.toFixed(2)}$ de ${limitUsd.toFixed(2)}$ este mes. Sube el tope del proyecto en su ficha o espera al próximo mes.`
    );
    this.name = "DataForSeoSpendLimitError";
    this.spentUsd = spentUsd;
    this.limitUsd = limitUsd;
    this.scope = scope;
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

// Coste del mes de un proyecto concreto (para su tope de proyecto).
export async function getProjectMonthSpendUsd(projectId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const agg = await prisma.apiUsageLog.aggregate({
    where: { api: "dataforseo", projectId, createdAt: { gte: startOfMonth } },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ? Number(agg._sum.costUsd) : 0;
}

// Comprueba AMBOS topes (global + proyecto si projectId y el proyecto tiene
// tope propio). Llamar ANTES de cualquier llamada nueva a DataForSEO. Si no hay
// topes configurados, no hace nada. Las lecturas de caché no gastan → no pasan
// por aquí.
export async function assertWithinSpendLimit(projectId?: string): Promise<void> {
  // Tope global.
  const limit = getMonthlyLimitUsd();
  if (limit !== null) {
    const spent = await getMonthSpendUsd();
    if (spent >= limit) throw new DataForSeoSpendLimitError(spent, limit, "global");
  }
  // Tope del proyecto.
  if (projectId) {
    const p = await prisma.project.findUnique({
      where: { id: projectId },
      select: { spendLimitUsd: true },
    });
    const pLimit = p?.spendLimitUsd ?? null;
    if (pLimit !== null && pLimit > 0) {
      const pSpent = await getProjectMonthSpendUsd(projectId);
      if (pSpent >= pLimit) throw new DataForSeoSpendLimitError(pSpent, pLimit, "project");
    }
  }
}
