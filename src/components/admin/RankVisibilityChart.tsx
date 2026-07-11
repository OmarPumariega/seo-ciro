"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Eye, TrendingUp, TrendingDown, Minus } from "lucide-react";

type VisibilityPoint = { date: string; index: number; keywordsWithData: number };

const COLOR = "#3949ab";

function fmtShort(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function RankVisibilityChart({ projectId, group }: { projectId: string; group?: string }) {
  const [points, setPoints] = useState<VisibilityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);

  useEffect(() => {
    let cancelled = false;
    const qs = group ? `?group=${encodeURIComponent(group)}` : "";
    fetch(`/api/proyectos/${projectId}/rank/visibilidad${qs}`)
      .then((r) => r.json())
      .then((d: VisibilityPoint[]) => {
        if (!cancelled) setPoints(Array.isArray(d) ? d : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, group]);

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

  const H = 150;
  const PAD_L = 30;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 22;
  const plotW = Math.max(10, w - PAD_L - PAD_R);
  const plotH = H - PAD_T - PAD_B;
  const n = points.length;

  const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_T + (1 - v / 100) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.index).toFixed(1)}`).join(" ");
  const areaPath =
    n > 0
      ? `${linePath} L${x(n - 1).toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${x(0).toFixed(1)},${(PAD_T + plotH).toFixed(1)} Z`
      : "";

  const current = points[n - 1];
  const previous = points[n - 2];
  const delta = current && previous ? Math.round((current.index - previous.index) * 10) / 10 : null;
  const labelStep = Math.max(1, Math.ceil(n / 7));

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Índice de visibilidad{group ? ` — ${group}` : ""}</h3>
        </div>
        {current && (
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold text-gray-900 tabular-nums">{current.index}</span>
            {delta !== null && delta !== 0 && (
              <span className={`flex items-center gap-0.5 text-xs font-medium ${delta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {delta > 0 ? "+" : ""}
                {delta}
              </span>
            )}
            {delta === 0 && <Minus className="h-3 w-3 text-gray-300" />}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : n === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          Sin datos suficientes todavía — comprueba alguna keyword para empezar el histórico.
        </p>
      ) : (
        <div ref={wrapRef} className="w-full">
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Índice de visibilidad">
            {[0, 50, 100].map((v) => (
              <g key={v}>
                <line x1={PAD_L} x2={w - PAD_R} y1={y(v)} y2={y(v)} stroke="#f1f5f9" strokeWidth={1} />
                <text x={PAD_L - 6} y={y(v) + 3} textAnchor="end" className="fill-gray-400" fontSize={9}>
                  {v}
                </text>
              </g>
            ))}
            <path d={areaPath} fill={COLOR} opacity={0.1} />
            {n >= 2 && <path d={linePath} fill="none" stroke={COLOR} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />}
            {points.map((p, i) => (
              <circle key={p.date} cx={x(i)} cy={y(p.index)} r={3.5} fill={COLOR} stroke="#fff" strokeWidth={1.5}>
                <title>{`${new Date(p.date).toLocaleDateString("es-ES")}: ${p.index} (${p.keywordsWithData} keywords)`}</title>
              </circle>
            ))}
            {points.map((p, i) =>
              i % labelStep === 0 || i === n - 1 ? (
                <text key={`l-${p.date}`} x={x(i)} y={H - 6} textAnchor="middle" className="fill-gray-400" fontSize={9}>
                  {fmtShort(new Date(p.date))}
                </text>
              ) : null
            )}
          </svg>
        </div>
      )}
      {n === 1 && <p className="mt-1 text-xs text-gray-400">Necesita al menos 2 días con chequeos para ver la evolución</p>}
      <p className="mt-2 text-[11px] text-gray-400">
        Ponderado por posición real × volumen de búsqueda real (0-100, 100 = todas tus keywords en el puesto 1). Curva de CTR estándar de referencia, no medida por nosotros — es un modelo, no una promesa de tráfico.
      </p>
    </div>
  );
}
