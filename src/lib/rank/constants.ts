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
