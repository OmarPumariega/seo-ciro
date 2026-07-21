import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

// Endpoint de diagnóstico SIN AUTH (intencionalmente): devuelve el hash del
// commit de git y la fecha de build. Útil para verificar desde fuera qué
// versión está corriendo en producción cuando hay sospechas de que el deploy
// no se actualizó. No expone nada sensible.
export async function GET() {
  let commit: string | null = null;
  let commitDate: string | null = null;
  try {
    // En runtime (VPS) el .git puede no estar disponible si se hizo un
    // docker copy solo del código — en ese caso commit queda null.
    commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    commitDate = execSync("git log -1 --format=%cI", { encoding: "utf8" }).trim();
  } catch {
    // Fallback: leer .next/BUILD_ID si existe (cambia con cada build).
    try {
      const buildIdPath = path.join(process.cwd(), ".next", "BUILD_ID");
      commit = `build:${readFileSync(buildIdPath, "utf8").trim().slice(0, 12)}`;
    } catch {
      commit = null;
    }
  }
  return NextResponse.json({
    commit,
    commitDate,
    nodeEnv: process.env.NODE_ENV ?? null,
    deployedAt: new Date().toISOString(),
  });
}
