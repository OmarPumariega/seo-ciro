import { prisma } from "@/lib/db/prisma";
import { checkRankKeyword } from "@/lib/rank/check";
import { notify } from "@/lib/notifications/notify";

// Job de fondo del Módulo 5: procesa las keywords de seguimiento cuya
// frecuencia programada (daily/weekly/monthly) se ha vencido. Las "manual"
// no se tocan aquí — el usuario las dispara síncrono desde la UI. Reutiliza
// el mismo poller que el Módulo 8 (instrumentation-node.ts), sin Redis.
//
// >>> REQUISITO DE NEGOCIO: TODAS las keywords programadas de un proyecto se
// chequean el MISMO DÍA. <<<
// Para garantizarlo, el job no recorre keywords sueltas sino PROYECTOS: cuando
// una keyword programada del proyecto está vencida, se chequean de golpe todas
// las programadas de ese proyecto (comparten timestamp → todas mismas
// lastCheckedAt → todas volverán a vencer a la vez en su próxima ventana). Si
// lo hiciéramos por keyword suelta (como antes), cada una arrastraría su propio
// lastCheckedAt y acabarían desfasándose según cuándo entraran en el tick.

// Cap de keywords por tick dentro del proyecto seleccionado. Cada SERP es una
// llamada (~3s y ~0,002$); 50/tick es un balance entre no machacar la API y
// avanzar rápido. Si un proyecto tiene más de 50, las restantes se procesan en
// el siguiente tick del cron: al actualizar lastCheckedAt de las ya hechas,
// las pendientes quedan "más vencidas" y el mismo proyecto vuelve a salir
// elegido en el siguiente tick.
const MAX_KEYWORDS_PER_PROJECT_TICK = 50;

const FREQUENCY_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export async function runRankJob(): Promise<{ processed: number }> {
  try {
    const projectId = await findMostOverdueProject();
    if (!projectId) {
      console.log("[rank] sin proyectos vencidos, tick idle");
      return { processed: 0 };
    }

    // Cuando el proyecto vence, chequea TODAS sus keywords programadas a la
    // vez (no solo las vencidas): compartan timestamp → mismo día. Las
    // "manual" no entran aquí (las dispara el usuario desde la UI).
    const projectKeywords = await prisma.rankKeyword.findMany({
      where: { projectId, frequency: { in: ["daily", "weekly", "monthly"] } },
      orderBy: { lastCheckedAt: "asc" }, // las nunca chequeadas / más antiguas primero
      take: MAX_KEYWORDS_PER_PROJECT_TICK,
    });

    let processed = 0;
    for (const rk of projectKeywords) {
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
        processed++;
      } catch (e) {
        console.error(`[rank] error chequeando "${rk.keyword}" (proyecto ${projectId}):`, e);
      }
    }

    console.log(`[rank] proyecto ${projectId}: ${processed}/${projectKeywords.length} keywords chequeadas`);
    return { processed };
  } catch (e) {
    console.error("[rank] error en runRankJob:", e);
    return { processed: 0 };
  }
}

// Selecciona el proyecto cuyo chequeo programado está MÁS vencido: la keyword
// programada con lastCheckedAt más antiguo (o null) que ya pasó su ventana de
// frecuencia. Sobreampleamos por lastCheckedAt asc y filtramos en JS (el
// intervalo de "vencida" depende de la frecuencia de cada fila, difícil de
// expresar en una sola query de Prisma). Devuelve solo el projectId: el job
// procesa 1 proyecto por tick para no machacar la API.
async function findMostOverdueProject(): Promise<string | null> {
  const now = Date.now();
  const candidates = await prisma.rankKeyword.findMany({
    where: { frequency: { in: ["daily", "weekly", "monthly"] } },
    orderBy: { lastCheckedAt: "asc" }, // null primero, luego más antiguas
    take: 200,
    select: { projectId: true, frequency: true, lastCheckedAt: true },
  });

  for (const rk of candidates) {
    const interval = FREQUENCY_MS[rk.frequency];
    if (!interval) continue;
    if (!rk.lastCheckedAt) return rk.projectId; // nunca chequeada → prioridad máxima
    if (now - rk.lastCheckedAt.getTime() >= interval) return rk.projectId; // vencida
  }

  return null;
}
