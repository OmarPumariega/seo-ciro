"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

type CategoryScore = { score: number; max: number; detail?: Record<string, number> };
type CategoryScores = {
  indexabilidad: CategoryScore;
  enlaces: CategoryScore;
  onpage: CategoryScore;
  accesibilidadImagenes: CategoryScore;
};

type AuditRun = {
  id: string;
  status: string;
  triggeredAt: string;
  categoryScores: CategoryScores | null;
};

const COLOR = "#f97316"; // naranja — mismo tono que el icono de incidencia

// Suma de los conteos ya persistidos en cada categoría (sin canonical +
// noindex + enlaces rotos + páginas con issue on-page + imágenes sin alt).
// Ningún dato nuevo: son los mismos números que ya se guardan en
// AuditRun.categoryScores al completar cada auditoría.
function totalIssues(cs: CategoryScores | null): number | null {
  if (!cs) return null;
  const d = cs.indexabilidad?.detail;
  const idx = d ? (d.sinCanonical ?? 0) + (d.noindexPages ?? 0) : 0;
  const enlaces = cs.enlaces?.detail?.enlacesRotos ?? 0;
  const onpage = cs.onpage?.detail?.paginasConIssuesOnPage ?? 0;
  const alt = cs.accesibilidadImagenes?.detail?.imagesMissingAlt ?? 0;
  return idx + enlaces + onpage + alt;
}

function fmtShort(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AuditIssuesTrendChart({ runs }: { runs: AuditRun[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = runs
    .filter((r) => r.status === "completed")
    .map((r) => ({ id: r.id, date: new Date(r.triggeredAt), value: totalIssues(r.categoryScores) }))
    .filter((p): p is { id: string; date: Date; value: number } => p.value !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const H = 160;
  const PAD_L = 26;
  const PAD_R = 14;
  const PAD_T = 12;
  const PAD_B = 22;
  const plotW = Math.max(10, w - PAD_L - PAD_R);
  const plotH = H - PAD_T - PAD_B;
  const n = points.length;
  const maxV = Math.max(1, ...points.map((p) => p.value));

  const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_T + (1 - v / maxV) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const areaPath =
    n > 0
      ? `${linePath} L${x(n - 1).toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + plotH).toFixed(1)} Z`
      : "";

  const labelStep = Math.max(1, Math.ceil(n / 6));

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">Incidencias detectadas por ejecución</h3>
      </div>

      {n === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">Aún no hay auditorías completadas</p>
      ) : (
        <div ref={wrapRef} className="w-full">
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Incidencias por ejecución">
            {[0, maxV].map((v) => (
              <text key={v} x={PAD_L - 6} y={y(v) + 3} textAnchor="end" className="fill-gray-400" fontSize={9}>
                {v}
              </text>
            ))}
            {n > 0 && <path d={areaPath} fill={COLOR} opacity={0.12} />}
            {n >= 2 && (
              <path d={linePath} fill="none" stroke={COLOR} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            )}
            {points.map((p, i) => (
              <circle key={p.id} cx={x(i)} cy={y(p.value)} r={3.5} fill={COLOR} stroke="#fff" strokeWidth={1.5}>
                <title>{`${p.date.toLocaleDateString("es-ES")}: ${p.value} incidencias`}</title>
              </circle>
            ))}
            {points.map((p, i) =>
              i % labelStep === 0 || i === n - 1 ? (
                <text key={`l-${p.id}`} x={x(i)} y={H - 6} textAnchor="middle" className="fill-gray-400" fontSize={9}>
                  {fmtShort(p.date)}
                </text>
              ) : null
            )}
          </svg>
        </div>
      )}
      {n === 1 && (
        <p className="mt-1 text-xs text-gray-400">Necesita al menos 2 auditorías para ver la evolución</p>
      )}
    </div>
  );
}
