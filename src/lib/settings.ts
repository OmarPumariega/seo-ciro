import { prisma } from "@/lib/db/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { SETTINGS_CATALOG, SETTINGS_KEYS, type SettingKey } from "@/lib/settings-catalog";

export { SETTINGS_CATALOG, type SettingKey, type SettingMeta } from "@/lib/settings-catalog";

// Ajustes editables desde /admin/configuracion: claves de API de terceros y
// parámetros operativos, cifrados en reposo (AppSetting.value, AES-256-CBC).
// Cada clave conocida cae en cascada: fila en BD (si se ha guardado desde la
// UI) → variable de entorno del mismo nombre (.env) → sin configurar. Así un
// despliegue nuevo sigue funcionando solo con el .env hasta que alguien lo
// configure desde la UI, sin tener que elegir una única fuente de verdad.
//
// El valor real NUNCA vuelve al cliente una vez guardado — getSettingsStatus()
// solo expone si está configurado y de dónde viene, nunca el propio secreto
// (ver /api/configuracion/ajustes).

// Caché en memoria de proceso: la app corre como un único proceso Node de
// larga duración (Docker/Coolify, sin serverless), así que un caché con TTL
// corto evita una query a BD en cada llamada a DataForSEO/OpenRouter sin
// arriesgarse a servir un valor desactualizado más de unos segundos tras
// guardar un cambio (invalidateSettingsCache() además lo fuerza al instante).
let cache: Map<string, string> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

async function loadCache(): Promise<Map<string, string>> {
  const rows = await prisma.appSetting.findMany();
  const next = new Map<string, string>();
  for (const row of rows) {
    try {
      next.set(row.key, decrypt(row.value));
    } catch {
      // Fila ilegible (ENCRYPTION_KEY rotada, dato corrupto) — se ignora y
      // cae al fallback de entorno en vez de tumbar la resolución entera.
    }
  }
  cache = next;
  cacheLoadedAt = Date.now();
  return next;
}

async function getCache(): Promise<Map<string, string>> {
  if (!cache || Date.now() - cacheLoadedAt > CACHE_TTL_MS) return loadCache();
  return cache;
}

export function invalidateSettingsCache(): void {
  cache = null;
}

export async function getSetting(key: SettingKey): Promise<string | null> {
  const c = await getCache();
  const fromDb = c.get(key);
  if (fromDb) return fromDb;
  return process.env[key] || null;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  if (!SETTINGS_KEYS.has(key)) throw new Error(`Clave de ajuste desconocida: ${key}`);
  const trimmed = value.trim();
  if (!trimmed) {
    await prisma.appSetting.deleteMany({ where: { key } });
  } else {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: encrypt(trimmed) },
      update: { value: encrypt(trimmed) },
    });
  }
  invalidateSettingsCache();
}

export async function clearSetting(key: SettingKey): Promise<void> {
  if (!SETTINGS_KEYS.has(key)) throw new Error(`Clave de ajuste desconocida: ${key}`);
  await prisma.appSetting.deleteMany({ where: { key } });
  invalidateSettingsCache();
}

export type SettingStatus = { configured: boolean; source: "db" | "env" | "none" };

// Nunca incluye el valor real — solo si hay algo configurado y de dónde
// viene, para que la UI pueda mostrar "configurado" sin poder leer el
// secreto de vuelta.
export async function getSettingsStatus(): Promise<Record<SettingKey, SettingStatus>> {
  const c = await loadCache(); // fresco siempre que se pinta la página de Configuración
  const status = {} as Record<SettingKey, SettingStatus>;
  for (const { key } of SETTINGS_CATALOG) {
    if (c.get(key)) status[key] = { configured: true, source: "db" };
    else if (process.env[key]) status[key] = { configured: true, source: "env" };
    else status[key] = { configured: false, source: "none" };
  }
  return status;
}
