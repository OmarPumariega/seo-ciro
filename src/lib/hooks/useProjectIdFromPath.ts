"use client";

import { usePathname } from "next/navigation";

// Extrae el projectId de la ruta /admin/proyectos/[id]/... si aplica. Vive
// aparte (no en un layout) porque tanto AdminSidebar como el widget flotante
// del Copilot lo necesitan y ninguno de los dos recibe el proyecto por
// props/contexto — ambos lo deducen de la URL.
export function useProjectIdFromPath(): string | null {
  const pathname = usePathname();
  const m = pathname?.match(/^\/admin\/proyectos\/([^/]+)(?:\/|$)/);
  return m ? m[1] : null;
}
