// Server-only: funciones que tocan la BD para la config global del informe.
// Vive aparte de sections.ts porque esta última se importa desde CLIENT
// components (InformeBuilder) y cualquier import aquí dentro (Prisma, pg)
// rompería el bundle del navegador si viviera allí.

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  normalizeReportConfig,
  type NormalizedConfig,
  type ReportSections,
  type SectionKey,
} from "@/lib/informe/sections";

const SETTING_KEY = "INFORME_DEFAULT_CONFIG";

// Lee y normaliza la config global. Si no hay fila en BD (deploy nuevo o
// usuario nunca la tocó), devuelve null → los callers caen al default
// hardcoded al llamar normalizeReportConfig(projectConfig, await ...).
export async function loadGlobalReportConfig(): Promise<NormalizedConfig | null> {
  const row = await prisma.globalSetting.findUnique({
    where: { key: SETTING_KEY },
  });
  if (!row) return null;
  // Normalizamos SIN base para que la global arranque del default hardcoded
  // — es el punto base de la cascada.
  return normalizeReportConfig(row.value);
}

// Persiste la config global. Sanea igual que el POST del endpoint por
// proyecto: rellena claves que falten, valida que order sea permutación.
export async function saveGlobalReportConfig(cfg: {
  sections?: Partial<ReportSections>;
  order?: SectionKey[];
}): Promise<NormalizedConfig> {
  const normalized = normalizeReportConfig(cfg);
  await prisma.globalSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: normalized as unknown as Prisma.JsonObject },
    update: { value: normalized as unknown as Prisma.JsonObject },
  });
  return normalized;
}

// Borra la config global (resetea al default hardcoded).
export async function deleteGlobalReportConfig(): Promise<void> {
  await prisma.globalSetting.deleteMany({ where: { key: SETTING_KEY } });
}
