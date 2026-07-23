import { prisma } from "@/lib/db/prisma";
import { checkRankKeyword } from "@/lib/rank/check";
import { notify } from "@/lib/notifications/notify";

// Job de fondo del Módulo 5: procesa las keywords de seguimiento cuya
// frecuencia programada (daily/weekly/monthly/quarterly) se ha vencido. Las
// "manual" no se tocan aquí — el usuario las dispara síncrono desde la UI.
// Reutiliza el mismo poller que el Módulo 8 (instrumentation-node.ts), sin Redis.
//
// Cada keyword se chequea vía checkRankKeyword, que aplica dos garantías:
//   1) Guard "un chequeo por día natural" (Europe/Madrid): aunque este tick
//      seleccione la keyword, si hoy ya se comprobó, NO llama a la API (devuelve
//      la posición fijada). Así el histórico es estable — un punto por día.
//   2) Dispara autoRunTfidf fire-and-forget en cada chequeo real: el cron
//      mantiene el TF-IDF fresco sin que el usuario tenga que ir a generarlo.
//
// >>> REQUISITO DE NEGOCIO: TODAS las keywords programadas de un proyecto se
// chequean el MISMO DÍA. <<<
// Para garantizarlo, el job no recorre keywords sueltas sino PROYECTOS: cuando
// una keyword programada del proyecto está vencida, se chequean de golpe todas
// las programadas de ese proyecto (comparten timestamp → todas mismas
// lastCheckedAt → todas volverán a vencer a la vez en su próxima ventana). Si
// lo hiciéramos por keyword suelta (como antes), cada una arrastraría su propio
// lastCheckedAt y acabarían desfasándose según cuándo entraran en el tick.
//
// Además del vencimiento por keyword (lastCheckedAt + frequency), un proyecto
// también puede tener una programación EXPLÍCITA (Project.rankNextScanAt +
// rankScanFrequency, ver /rank/schedule): un disparador adicional para dejar
// fijado "el próximo escaneo conjunto será tal día", que se auto-reprograma al
// dispararse. Ninguno sustituye al otro — un proyecto sin programación
// explícita sigue funcionando exactamente igual que antes.

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
  quarterly: 91 * 24 * 60 * 60 * 1000,
};

export async function runRankJob(): Promise<{ processed: number }> {
  try {
    const projectId = await findMostOverdueProject();
    if (!projectId) {
      console.log("[rank] sin proyectos vencidos, tick idle");
      return { processed: 0 };
    }

    // Marca el turno servido YA, no al terminar de procesar — así el
    // reparto por round-robin avanza al siguiente tick aunque este proyecto
    // tenga tanto backlog que no lo vacíe entero en este tick (ver
    // findMostOverdueProject: sin esto, un proyecto grande podía acaparar
    // varios ticks seguidos dejando a otros proyectos esperando).
    const project = await prisma.project.update({
      where: { id: projectId },
      data: { rankLastDequeuedAt: new Date() },
      select: { rankScanFrequency: true },
    });

    // Si el proyecto tiene programación explícita, se avanza YA al siguiente
    // ciclo (recurrente) — así el usuario no tiene que reprogramar a mano cada
    // vez que se dispara. Si el intervalo no se reconoce (dato corrupto/valor
    // viejo), se deja como está en vez de reventar el tick entero.
    if (project.rankScanFrequency) {
      const interval = FREQUENCY_MS[project.rankScanFrequency];
      if (interval) {
        await prisma.project.update({
          where: { id: projectId },
          data: { rankNextScanAt: new Date(Date.now() + interval) },
        });
      }
    }

    // Cuando el proyecto vence, chequea TODAS sus keywords programadas a la
    // vez (no solo las vencidas): compartan timestamp → mismo día. Las
    // "manual" no entran aquí (las dispara el usuario desde la UI).
    const projectKeywords = await prisma.rankKeyword.findMany({
      where: { projectId, frequency: { in: ["daily", "weekly", "monthly", "quarterly"] } },
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

// Cap de candidatos leídos para detectar qué proyectos tienen trabajo
// vencido. No hace falta ver TODAS las keywords del sistema para saber qué
// proyectos están vencidos, solo una muestra suficientemente amplia — si un
// proyecto real tuviera más de esto en keywords "daily" sin ninguna vencida
// entre las primeras leídas, seguiría detectándose en el siguiente tick.
const OVERDUE_SCAN_LIMIT = 1000;

// Reparto justo (round-robin) entre proyectos con trabajo vencido: en vez de
// elegir siempre la keyword individual más vencida de TODO el sistema (lo
// que dejaba que un proyecto con cientos de keywords "daily" acaparara tick
// tras tick), se agrega primero qué proyectos tienen AL MENOS una keyword
// vencida, y entre esos se elige el que lleva más tiempo sin recibir turno
// (Project.rankLastDequeuedAt, null = nunca) — independientemente de cuán
// vencido esté su backlog. Un proyecto con 500 keywords daily y otro con 2
// alternan turno por igual, en vez de que el grande monopolice el cron.
async function findMostOverdueProject(): Promise<string | null> {
  const now = Date.now();
  const candidates = await prisma.rankKeyword.findMany({
    where: { frequency: { in: ["daily", "weekly", "monthly", "quarterly"] } },
    orderBy: { lastCheckedAt: "asc" }, // null primero, luego más antiguas
    take: OVERDUE_SCAN_LIMIT,
    select: { projectId: true, frequency: true, lastCheckedAt: true },
  });

  const overdueProjectIds = new Set<string>();
  for (const rk of candidates) {
    const interval = FREQUENCY_MS[rk.frequency];
    if (!interval) continue;
    if (!rk.lastCheckedAt || now - rk.lastCheckedAt.getTime() >= interval) {
      overdueProjectIds.add(rk.projectId);
    }
  }

  // Disparador adicional: programación explícita a nivel de proyecto
  // (Project.rankNextScanAt), independiente de si alguna keyword suelta está
  // vencida por su propio lastCheckedAt — ver comentario de cabecera.
  const scheduledDue = await prisma.project.findMany({
    where: { rankNextScanAt: { lte: new Date(now) } },
    select: { id: true },
  });
  for (const p of scheduledDue) overdueProjectIds.add(p.id);

  if (overdueProjectIds.size === 0) return null;

  const projects = await prisma.project.findMany({
    where: { id: { in: [...overdueProjectIds] } },
    select: { id: true, rankLastDequeuedAt: true },
    orderBy: { rankLastDequeuedAt: { sort: "asc", nulls: "first" } },
  });

  return projects[0]?.id ?? null;
}
