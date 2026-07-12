"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// Mapa real (Leaflet + teselas de OpenStreetMap, sin API key) del Módulo 9.
// Se muestra SIEMPRE, incluso antes de lanzar el primer geogrid — centrado en
// las coordenadas reales del negocio con el radio de la rejilla dibujado,
// para que el usuario tenga contexto geográfico aunque todavía no haya datos.
// Cuando hay un run con puntos, cada uno se pinta como un círculo de color
// (mismo semáforo que el heatmap de cuadrícula: verde/ámbar/naranja/rojo/gris).
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
};

function colorFor(position: number | null): string {
  if (position === null) return "#d1d5db"; // gray-300
  if (position <= 3) return "#10b981"; // emerald-500
  if (position <= 10) return "#fbbf24"; // amber-400
  if (position <= 20) return "#fb923c"; // orange-400
  return "#ef4444"; // red-500
}

export default function GeogridMap({
  centerLat,
  centerLng,
  radiusKm,
  points,
  keyword,
}: {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  points: GeogridMapPoint[] | null;
  keyword?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerGroupRef = useRef<any>(null);

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

      // Marcador del negocio (centro de la rejilla).
      L.circleMarker([centerLat, centerLng], {
        radius: 7,
        color: "#111827",
        weight: 2,
        fillColor: "#111827",
        fillOpacity: 1,
      })
        .bindTooltip(keyword ? `Centro · ${keyword}` : "Centro del negocio")
        .addTo(group);

      for (const p of points ?? []) {
        L.circleMarker([p.lat, p.lng], {
          radius: 9,
          color: "#ffffff",
          weight: 1.5,
          fillColor: colorFor(p.position),
          fillOpacity: 0.9,
        })
          .bindTooltip(
            p.position === null
              ? "No aparece en este punto"
              : `#${p.position}${p.title ? " · " + p.title : ""}`
          )
          .addTo(group);
      }

      // Encuadra todo si hay puntos; si no, dos radios de margen sobre el centro.
      if (points && points.length > 0) {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
        bounds.extend([centerLat, centerLng]);
        map.fitBounds(bounds, { padding: [24, 24] });
      }
    });
  }, [centerLat, centerLng, radiusKm, points, keyword]);

  return <div ref={containerRef} className="h-80 w-full rounded-lg overflow-hidden border border-gray-100" />;
}
