/**
 * Lógica del cron interno, en un fichero separado de `instrumentation.ts`
 * para que solo se importe aislada en el runtime de Node (ver
 * `instrumentation.ts`, que es el único fichero que Next.js realmente
 * auto-descubre — este nombre "-node" es solo una convención propia, no algo
 * que Next reconozca por sí solo).
 *
 * Cada 60s ejecuta tres jobs:
 *   • Módulo 8 — procesa una AuditRun "pending" (crawler + PSI + GSC).
 *   • Módulo 5 — procesa las keywords de rank tracking cuya frecuencia
 *     programada (daily/weekly/monthly) se ha vencido.
 *   • Módulo 9 — procesa un geogrid "pending" (rejilla N×N de Maps SERP).
 * Intervalo corto a propósito: el usuario pulsa "Ejecutar auditoría ahora" y
 * espera viendo la UI; varios minutos de latencia se sentirían rotos. (El
 * rank tracking manual es síncrono y no pasa por aquí.)
 *
 * El guard con globalThis evita duplicar el timer si el módulo se evalúa
 * varias veces. Solo en producción — en `npm run dev` este cron NUNCA corre;
 * para probarlo de verdad hace falta `npm run build && npm run start`.
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

  const [{ runAuditJob }, { runRankJob }, { runGeogridJob }] = await Promise.all([
    import("@/lib/audit/job"),
    import("@/lib/rank/job"),
    import("@/lib/geogrid/job"),
  ]);

  const run = async () => {
    try {
      const audit = await runAuditJob();
      if (audit.processed > 0) console.log(`[audit] procesadas=${audit.processed}`);
    } catch (e) {
      console.error("[audit] error en run:", e);
    }
    try {
      const rank = await runRankJob();
      if (rank.processed > 0) console.log(`[rank] procesadas=${rank.processed}`);
    } catch (e) {
      console.error("[rank] error en run:", e);
    }
    try {
      const geo = await runGeogridJob();
      if (geo.processed > 0) console.log(`[geogrid] procesados=${geo.processed}`);
    } catch (e) {
      console.error("[geogrid] error en run:", e);
    }
  };

  setTimeout(run, FIRST_RUN_DELAY_MS);
  g[TIMER_GLOBAL_KEY] = setInterval(run, RUN_INTERVAL_MS);
  console.log(`[cron] interno arrancado (cada ${RUN_INTERVAL_MS / 1000}s): audit + rank + geogrid`);
}
