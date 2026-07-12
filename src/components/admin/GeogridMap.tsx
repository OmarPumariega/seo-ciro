"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { MapsTopItem } from "@/lib/geogrid/maps";

// Mapa real (Leaflet + teselas de OpenStreetMap, sin API key) del Módulo 9,
// con el mismo lenguaje visual que las herramientas de geogrid de referencia
// (LocalFalcon/DinoRank): un círculo de color por punto de la rejilla con la
// posición en número dentro, sobre un mapa real — no una cuadrícula
// abstracta de cuadrados. Se muestra SIEMPRE, incluso antes de lanzar el
// primer geogrid, centrado en las coordenadas reales del negocio con el
// radio de la rejilla dibujado, para que haya contexto geográfico aunque
// todavía no haya datos.
//
// Se usa Leaflet "a pelo" (sin react-leaflet) para no arrastrar problemas de
// compatibilidad de versión con React 19 — un único useEffect monta/desmonta
// el mapa, y las capas de puntos se recrean cada vez que cambian los props.

export type GeogridMapPoint = {
  row: number;
  col: number;
  lat: number;
  lng: number;
  position: number | null;
  title: string | null;
  top?: MapsTopItem[];
};

function colorFor(position: number | null): string {
  if (position === null) return "#9ca3af"; // gray-400
  if (position <= 3) return "#10b981"; // emerald-500
  if (position <= 10) return "#f59e0b"; // amber-500
  if (position <= 20) return "#fb923c"; // orange-400
  return "#ef4444"; // red-500
}

export default function GeogridMap({
  centerLat,
  centerLng,
  radiusKm,
  points,
  keyword,
  selected,
  onSelectPoint,
}: {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  points: GeogridMapPoint[] | null;
  keyword?: string;
  selected?: { row: number; col: number } | null;
  onSelectPoint?: (point: GeogridMapPoint) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerGroupRef = useRef<any>(null);
  const onSelectRef = useRef(onSelectPoint);
  onSelectRef.current = onSelectPoint;

  // Monta el mapa una vez. No depende de centerLat/centerLng para no
  // reinicializar Leaflet (error "Map container is already initialized")
  // cada vez que cambia el run seleccionado — en su lugar, un segundo effect
  // hace map.setView() cuando cambia el centro.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [centerLat, centerLng],
        zoom: 13,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerGroupRef.current = L.layerGroup().addTo(map);
      // Fuerza un recalculo del tamaño tras el primer paint (el contenedor
      // puede medir 0 si el mapa se monta dentro de una pestaña oculta).
      setTimeout(() => map.invalidateSize(), 100);
    });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerGroupRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redibuja centro + radio + puntos cada vez que cambian los datos, sin
  // recrear el mapa.
  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current) return;
    import("leaflet").then((L) => {
      const map = mapRef.current;
      const group = layerGroupRef.current;
      if (!map || !group) return;
      group.clearLayers();

      map.setView([centerLat, centerLng], map.getZoom());

      // Radio de la rejilla, siempre visible como contexto aunque no haya
      // datos todavía.
      L.circle([centerLat, centerLng], {
        radius: radiusKm * 1000,
        color: "#111827",
        weight: 1,
        fillOpacity: 0.03,
        dashArray: "4 4",
      }).addTo(group);

      // Marcador del negocio (centro de la rejilla): un pin oscuro simple,
      // distinto de los círculos numerados de los puntos de la rejilla.
      L.marker([centerLat, centerLng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:9999px;background:#111827;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      })
        .bindTooltip(keyword ? `Centro · ${keyword}` : "Centro del negocio")
        .addTo(group);

      for (const p of points ?? []) {
        const isSelected = selected && selected.row === p.row && selected.col === p.col;
        const size = isSelected ? 32 : 26;
        const bg = colorFor(p.position);
        const label = p.position === null ? "—" : String(p.position);
        const marker = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};border:${isSelected ? 3 : 2}px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:${isSelected ? 13 : 11}px;font-family:inherit;">${label}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
          zIndexOffset: isSelected ? 1000 : 0,
        }).bindTooltip(
          p.position === null
            ? "No aparece en este punto"
            : `#${p.position}${p.title ? " · " + p.title : ""}`
        );
        marker.on("click", () => onSelectRef.current?.(p));
        marker.addTo(group);
      }

      // Encuadra todo si hay puntos; si no, dos radios de margen sobre el centro.
      if (points && points.length > 0) {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
        bounds.extend([centerLat, centerLng]);
        map.fitBounds(bounds, { padding: [32, 32] });
      }
    });
  }, [centerLat, centerLng, radiusKm, points, keyword, selected]);

  return <div ref={containerRef} className="h-[420px] w-full rounded-lg overflow-hidden border border-gray-100" />;
}
