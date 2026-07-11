// Matemática del geogrid (Módulo 9). Genera los puntos de una rejilla N×N
// centrada en el negocio, repartidos sobre un radio dado. Pura, sin IO.
//
// El grid cubre de -radius a +radius en cada eje (span total = 2×radius). Para
// N puntos, la fracción de cada índice va de -1 a +1. La conversión de km a
// grados usa la aproximación 1º lat ≈ 111 km y 1º lng ≈ 111·cos(lat).

export type GridPoint = {
  row: number;
  col: number;
  lat: number;
  lng: number;
};

const KM_PER_DEG_LAT = 111.0;

export function generateGridPoints(
  centerLat: number,
  centerLng: number,
  gridSize: number,
  radiusKm: number
): GridPoint[] {
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);
  const points: GridPoint[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // fracción en [-1, 1]; row=0 arriba (norte), col=0 izquierda (oeste)
      const fRow = gridSize === 1 ? 0 : (row / (gridSize - 1)) * 2 - 1;
      const fCol = gridSize === 1 ? 0 : (col / (gridSize - 1)) * 2 - 1;
      // En el mapa, "arriba" = mayor latitud → invertimos fRow.
      const dLatKm = -fRow * radiusKm;
      const dLngKm = fCol * radiusKm;
      points.push({
        row,
        col,
        lat: centerLat + dLatKm / KM_PER_DEG_LAT,
        lng: centerLng + (kmPerDegLng > 0 ? dLngKm / kmPerDegLng : 0),
      });
    }
  }

  return points;
}
