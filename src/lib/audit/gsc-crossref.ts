import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google/client";
import { listImpressedPages } from "@/lib/google/search-console";

const LOOKBACK_DAYS = 90;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Devuelve null si no hay conexión de Google o no hay gscSiteUrl configurado
// para el proyecto — la auditoría sigue sin este dato (gscChecked=false),
// nunca inventa un resultado de indexación.
export async function crossReferenceGsc(
  gscSiteUrl: string | null
): Promise<Set<string> | null> {
  if (!gscSiteUrl) return null;

  try {
    const auth = await getGoogleClient();
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - LOOKBACK_DAYS);
    return await listImpressedPages(auth, gscSiteUrl, {
      startDate: isoDate(start),
      endDate: isoDate(end),
    });
  } catch (error) {
    if (error instanceof GoogleNotConnectedError) return null;
    // Cualquier otro fallo (token revocado, propiedad sin acceso...) tampoco
    // debe tumbar el resto de la auditoría — se degrada igual que "sin conexión".
    return null;
  }
}
