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
 *
 * Importante: se agenda con `setTimeout` recursivo, NO `setInterval`. Con
 * `setInterval` el siguiente tick se dispara a los 60s exactos aunque el
 * `run()` anterior siga en marcha — y `runRankJob` puede tardar más de 60s
 * si el proyecto elegido tiene muchas keywords vencidas (cada chequeo SERP
 * son ~1-3s, secuenciales, hasta 50/tick). Dos ticks solapados podían
 * re-chequear la misma keyword dos veces (gasto duplicado). El setTimeout
 * recursivo solo agenda el siguiente tick cuando el actual ha terminado del
 * todo (los tres jobs + notificaciones).
 */

const TIMER_GLOBAL_KEY = "__seoCiroAuditTimer" as const;
const RUN_INTERVAL_MS = 60 * 1000; // 60s de descanso ENTRE ticks, no de intervalo fijo
const FIRST_RUN_DELAY_MS = 30_000; // 30s (no cargar el arranque del contenedor)

type GlobalWithTimer = typeof globalThis & {
  [TIMER_GLOBAL_KEY]?: NodeJS.Timeout | true;
};

export async function register() {
  if (process.env.NODE_ENV !== "production") return;

  const g = globalThis as GlobalWithTimer;
  if (g[TIMER_GLOBAL_KEY]) return; // ya arrancado (hot-reload / re-entrada)

  const [{ runAuditJob }, { runRankJob }, { runGeogridJob }, { checkSpendNotifications }] = await Promise.all([
    import("@/lib/audit/job"),
    import("@/lib/rank/job"),
    import("@/lib/geogrid/job"),
    import("@/lib/notifications/notify"),
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
    // Aviso de gasto (tope DataForSEO). Dedupe por día → un aviso/día como máx.
    try {
      await checkSpendNotifications();
    } catch (e) {
      console.error("[notify] error en check de gasto:", e);
    }

    // Solo agenda el siguiente tick cuando este ha terminado del todo —
    // ver nota arriba sobre por qué NO es setInterval.
    setTimeout(run, RUN_INTERVAL_MS);
  };

  setTimeout(run, FIRST_RUN_DELAY_MS);
  g[TIMER_GLOBAL_KEY] = true; // solo marca "ya arrancado"; el propio run() se reagenda
  console.log(`[cron] interno arrancado (descanso de ${RUN_INTERVAL_MS / 1000}s entre ticks): audit + rank + geogrid`);
}
