// Helper de "día natural" en zona horaria Europe/Madrid para el guard de
// rank tracking: máximo un chequeo real por keyword y por día (ver
// check.ts). La zona horaria es la de la agencia (España), con su offset
// real de verano (+02:00) / invierno (+01:00) calculado en runtime vía
// Intl.DateTimeFormat — nada hardcodeado, sigue siendo correcto aunque
// cambien las reglas del horario DST.

// Devuelve el intervalo [inicio, fin) del día natural de Madrid que contiene
// `now`, expresado como Date UTC para usar directamente en un where Prisma:
//   checkedAt: { gte: start, lt: end }
export function madridDayBounds(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string): number => {
    const v = parts.find((p) => p.type === t)?.value;
    return v ? Number(v) : 0;
  };
  const year = get("year");
  const month = get("month") - 1; // 0-indexed
  const day = get("day");
  const hour = get("hour") % 24; // "24" puede aparecer para medianoche con hour12:false
  const minute = get("minute");
  const second = get("second");

  // El mismo instante `now`, pero con sus campos de Madrid interpretados como
  // si fueran UTC. La diferencia con el `now` real (en ms) es justo el offset
  // de Madrid respecto a UTC (positivo: Madrid va por delante).
  const madridAsUtcMs = Date.UTC(year, month, day, hour, minute, second);
  const offsetMs = madridAsUtcMs - now.getTime();

  // 00:00:00 de Madrid, expresado como UTC.
  const startMs = Date.UTC(year, month, day, 0, 0, 0) - offsetMs;
  const endMs = startMs + 24 * 60 * 60 * 1000; // inicio del día siguiente

  return { start: new Date(startMs), end: new Date(endMs) };
}
