import { prisma } from "@/lib/db/prisma";
import { isEmailConfigured, sendEmail } from "@/lib/notifications/email";
import { getMonthSpendUsd, getMonthlyLimitUsd } from "@/lib/dataforseo/spend";

// Punto único de entrada para avisos por email. Dedupe: si ya existe un
// NotificationLog con (type, key), no se reenvía. Así una auditoría se avisa
// una vez, una caída de posición se avisa una vez por keyword y día, etc. —
// sin espamear.
export async function notify(params: {
  type: string;
  key: string;
  subject: string;
  body: string;
}): Promise<void> {
  if (!isEmailConfigured()) return; // sin SMTP → no-op silencioso

  // Dedupe: si ya avisamos de esta (type, key), no repetimos.
  const already = await prisma.notificationLog.findUnique({
    where: { type_key: { type: params.type, key: params.key } },
    select: { id: true },
  });
  if (already) return;

  const ok = await sendEmail({ subject: params.subject, text: params.body });
  if (ok) {
    // Idempotente por si dos ticks del cron compiten.
    await prisma.notificationLog
      .upsert({
        where: { type_key: { type: params.type, key: params.key } },
        create: { type: params.type, key: params.key },
        update: {},
      })
      .catch(() => {});
  }
}

// Aviso de gasto de DataForSEO cerca o superando el tope mensual. Llamado
// desde el cron cada tick; el dedupe (key por tipo+fecha) lo limita a un aviso
// por día y por tipo. Si no hay tope configurado, no hace nada.
export async function checkSpendNotifications(): Promise<void> {
  const limit = getMonthlyLimitUsd();
  if (limit === null) return;

  const spent = await getMonthSpendUsd();
  const today = new Date().toISOString().slice(0, 10);

  if (spent >= limit) {
    await notify({
      type: "spend_exceeded",
      key: today,
      subject: "⚠️ Tope de gasto de DataForSEO superado",
      body: `El gasto mensual de DataForSEO ha superado el tope configurado: ${spent.toFixed(2)}$ de ${limit.toFixed(2)}$. Las nuevas llamadas están bloqueadas hasta el próximo mes o hasta que subas DATAFORSEO_MONTHLY_LIMIT_USD.`,
    });
  } else if (spent >= limit * 0.8) {
    await notify({
      type: "spend_warning",
      key: today,
      subject: "Tope de gasto de DataForSEO cercano",
      body: `Llevas ${spent.toFixed(2)}$ de ${limit.toFixed(2)}$ (80%) de gasto mensual de DataForSEO. Revisa el panel de costes por si quieres ajustar frecuencia/depth de los seguimientos.`,
    });
  }
}
