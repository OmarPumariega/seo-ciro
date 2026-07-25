// Única fuente de verdad para los valores permitidos de RankKeyword.frequency y
// sus etiquetas en español — antes vivía duplicado (con el mismo listado
// copiado a mano) en 3 rutas API distintas más los labels sueltos en
// RankView.tsx. "quarterly" se añadió aquí para no tener que sincronizar 5
// sitios cada vez que cambie el conjunto de frecuencias soportadas.

export const RANK_FREQUENCIES = ["manual", "daily", "weekly", "monthly", "quarterly"] as const;
export type RankFrequency = (typeof RANK_FREQUENCIES)[number];

export const RANK_FREQUENCY_LABELS: Record<string, string> = {
  manual: "Manual",
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
};

// Subconjunto ofrecido en la programación conjunta a nivel de proyecto
// (src/app/api/proyectos/[id]/rank/schedule/route.ts) — "manual" no aplica (por
// definición no se programa) y "daily" no tiene sentido para un barrido
// conjunto de todas las keywords de un proyecto.
export const RANK_SCAN_FREQUENCIES = ["weekly", "monthly", "quarterly"] as const;
export type RankScanFrequency = (typeof RANK_SCAN_FREQUENCIES)[number];

// Duración de cada frecuencia programada — antes vivía solo dentro de
// src/lib/rank/job.ts; se comparte aquí para que la UI pueda calcular
// "próximo escaneo" con la MISMA fórmula que usa el cron para decidir
// cuándo una keyword está vencida (ver findMostOverdueProject).
export const FREQUENCY_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  quarterly: 91 * 24 * 60 * 60 * 1000,
};

// Fecha del próximo escaneo automático de una keyword — la más próxima entre
// su propio vencimiento por rueda (lastCheckedAt + frequency) y el escaneo
// conjunto explícito del proyecto (rankNextScanAt), si aplica a su
// frecuencia. null = sin auto-escaneo (frecuencia "manual").
export function computeNextScanAt(
  keyword: { frequency: string; lastCheckedAt: Date | null },
  project: { rankScanFrequency: string | null; rankNextScanAt: Date | null }
): Date | null {
  const interval = FREQUENCY_MS[keyword.frequency];
  if (!interval) return null; // "manual"

  const ownDue = keyword.lastCheckedAt
    ? new Date(keyword.lastCheckedAt.getTime() + interval)
    : new Date(); // nunca comprobada → vencida desde ya

  const appliesProjectSchedule =
    project.rankNextScanAt !== null &&
    (RANK_SCAN_FREQUENCIES as readonly string[]).includes(keyword.frequency);

  if (appliesProjectSchedule && project.rankNextScanAt! < ownDue) {
    return project.rankNextScanAt;
  }
  return ownDue;
}
