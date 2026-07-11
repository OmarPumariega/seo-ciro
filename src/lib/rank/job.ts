import { prisma } from "@/lib/db/prisma";
import { checkRankKeyword } from "@/lib/rank/check";
import { notify } from "@/lib/notifications/notify";

// Job de fondo del Módulo 5: procesa las keywords de seguimiento cuya
// frecuencia programada (daily/weekly/monthly) se ha vencido. Las "manual"
// no se tocan aquí — el usuario las dispara síncrono desde la UI. Reutiliza
// el mismo poller que el Módulo 8 (instrumentation-node.ts), sin Redis.

const BATCH_SIZE = 5; // máx. keywords por tick (cada SERP es una llamada, ~3s)

const FREQUENCY_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export async function runRankJob(): Promise<{ processed: number }> {
  const due = await findDueKeywords();

  for (const rk of due) {
    // lastPosition aquí es el ANTERIOR al chequeo (checkRankKeyword lo actualiza).
    const prevPos = rk.lastPosition;
    try {
      const result = await checkRankKeyword(rk.id);
      // Aviso de caída de posición: solo en chequeos programados (no manuales),
      // umbral ≥10 posiciones peor. Dedupe por keyword+fecha (un aviso por día).
      if (
        prevPos !== null &&
        result.position !== null &&
        result.position >= prevPos + 10
      ) {
        await notify({
          type: "rank_drop",
          key: `${rk.id}:${new Date().toISOString().slice(0, 10)}`,
          subject: `Caída de posición — «${rk.keyword}»`,
          body: `La keyword «${rk.keyword}» ha caído de #${prevPos} a #${result.position} (Δ ${result.position - prevPos}) en el proyecto ${rk.projectId}. Detalle en el panel: /admin/proyectos/${rk.projectId}/rank`,
        });
      }
    } catch (e) {
      console.error(`[rank] error chequeando "${rk.keyword}":`, e);
    }
  }

  return { processed: due.length };
}

// Selecciona keywords programadas cuyo último chequeo caducó (o nunca se
// chequearon). orderBy lastCheckedAt asc pone primero las nunca chequeadas
// (null) y las más antiguas; sobreamuestramos y filtramos en JS porque el
// intervalo de "vencida" depende de la frecuencia de cada fila (difícil de
// expresar en una sola query de Prisma). Para una herramienta interna de
// bajo tráfico es más que suficiente.
async function findDueKeywords() {
  const now = Date.now();
  const candidates = await prisma.rankKeyword.findMany({
    where: { frequency: { in: ["daily", "weekly", "monthly"] } },
    orderBy: { lastCheckedAt: "asc" },
    take: BATCH_SIZE * 4,
  });

  const due = candidates.filter((rk) => {
    const interval = FREQUENCY_MS[rk.frequency];
    if (!interval) return false;
    if (!rk.lastCheckedAt) return true;
    return now - rk.lastCheckedAt.getTime() >= interval;
  });

  return due.slice(0, BATCH_SIZE);
}
