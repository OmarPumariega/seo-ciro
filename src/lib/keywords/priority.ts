// Priorización de keywords dentro de un estudio. Pura, sin efectos ni IO.
//
// priority = round((volumen / volumenMáximoDelEstudio) * 100)
//
// Competición y CPC NO entran en la fórmula: quedan como columnas visibles
// para que la agencia las pondere a mano (mismo principio "auditable, no caja
// negra" que scoring.ts del Módulo 8). Mezclarlas exigiría una decisión de
// negocio (¿prioridad = más volumen, o más volumen con menos competición?)
// que no corresponde tomar en silencio.
//
// Una keyword sin volumen conocido (searchVolume null) cuenta como 0: no
// arrastra abajo a las que sí tienen dato, simplemente no aporta prioridad.
export function computePriorities(
  keywords: { keyword: string; searchVolume: number | null }[]
): Map<string, number> {
  const volumes = keywords.map((k) => k.searchVolume ?? 0);
  const max = Math.max(...volumes, 0);

  const result = new Map<string, number>();
  for (const k of keywords) {
    const vol = k.searchVolume ?? 0;
    const priority = max > 0 ? Math.round((vol / max) * 100) : 0;
    result.set(k.keyword, priority);
  }
  return result;
}
