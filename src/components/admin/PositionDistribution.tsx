// Distribución de fuerza de un dominio: cuántas de sus keywords están en
// top-3, top-10 (posiciones 4-10) y top-100 (resto). Barra apilada con tres
// segmentos. Es la señal más útil para comparar dominios de un vistazo, y ya
// venía gratis en domain_rank_overview (antes se descartaba).
//
// Componente compartido: lo usan Competidores (panel propio y de cada
// competidor) y el panel de visibilidad de Auditoría.

export type PositionBuckets = { top3: number; top10: number; top100: number };

export default function PositionDistribution({
  buckets,
  avgPosition,
}: {
  buckets: PositionBuckets | null;
  avgPosition?: number | null;
}) {
  if (!buckets) return null;
  const total = buckets.top3 + buckets.top10 + buckets.top100;
  if (total === 0) return null;
  const pct = (n: number) => (n / total) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100">
        {buckets.top3 > 0 && (
          <div className="bg-emerald-500" style={{ width: `${pct(buckets.top3)}%` }} title={`Top 3: ${buckets.top3}`} />
        )}
        {buckets.top10 > 0 && (
          <div className="bg-emerald-300" style={{ width: `${pct(buckets.top10)}%` }} title={`Top 4-10: ${buckets.top10}`} />
        )}
        {buckets.top100 > 0 && (
          <div className="bg-gray-300" style={{ width: `${pct(buckets.top100)}%` }} title={`Top 11-100: ${buckets.top100}`} />
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Top 3 · <strong className="text-gray-700">{buckets.top3}</strong>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-300" /> Top 4-10 · <strong className="text-gray-700">{buckets.top10}</strong>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-gray-300" /> Top 11-100 · <strong className="text-gray-700">{buckets.top100}</strong>
        </span>
        {typeof avgPosition === "number" && avgPosition !== null && (
          <span className="text-gray-400">Pos. media {avgPosition.toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}
