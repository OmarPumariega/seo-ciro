/**
 * Lógica del cron interno del Módulo 8 (Auditoría Técnica), en un fichero
 * separado de `instrumentation.ts` para que solo se importe quede aislada
 * en el runtime de Node (ver `instrumentation.ts`, que es el único fichero
 * que Next.js realmente auto-descubre — este nombre "-node" es solo una
 * convención propia, no algo que Next reconozca por sí solo).
 *
 * Cada 60s revisa si hay una AuditRun "pending" y la procesa (crawler + PSI
 * + cruce GSC). Intervalo corto a propósito: a diferencia de un cron que
 * nadie mira, aquí el usuario pulsa "Ejecutar auditoría ahora" y espera
 * viendo la UI — varios minutos de latencia inicial se sentirían roto.
 *
 * El guard con globalThis evita duplicar el timer si el módulo se evalúa
 * varias veces. Solo en producción — en `npm run dev` este cron NUNCA corre;
 * para probar el Módulo 8 de verdad hace falta `npm run build && npm run start`.
 */

const TIMER_GLOBAL_KEY = "__seoCiroAuditTimer" as const;
const RUN_INTERVAL_MS = 60 * 1000; // 60s
const FIRST_RUN_DELAY_MS = 30_000; // 30s (no cargar el arranque del contenedor)

type GlobalWithTimer = typeof globalThis & {
  [TIMER_GLOBAL_KEY]?: NodeJS.Timeout;
};

export async function register() {
  if (process.env.NODE_ENV !== "production") return;

  const g = globalThis as GlobalWithTimer;
  if (g[TIMER_GLOBAL_KEY]) return; // ya arrancado (hot-reload / re-entrada)

  const { runAuditJob } = await import("@/lib/audit/job");

  const run = async () => {
    try {
      const r = await runAuditJob();
      if (r.processed > 0) {
        console.log(`[audit] procesadas=${r.processed}`);
      }
    } catch (e) {
      console.error("[audit] error en run:", e);
    }
  };

  setTimeout(run, FIRST_RUN_DELAY_MS);
  g[TIMER_GLOBAL_KEY] = setInterval(run, RUN_INTERVAL_MS);
  console.log(`[audit] cron interno arrancado (cada ${RUN_INTERVAL_MS / 1000}s)`);
}
