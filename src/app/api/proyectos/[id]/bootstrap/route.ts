import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import {
  bootstrapProjectAnalysis,
  estimateBootstrapCost,
} from "@/lib/projects/bootstrap";

// Lanzamiento completo de un proyecto: importa las keywords de los estudios
// al Rank Tracking y las chequea (lo que dispara TF-IDF gratis vía SerpCache),
// analiza visibilidad y content gap de cada competidor, y devuelve un resumen.
//
// Lo invoca:
//   • El paso "Lanzar" del wizard de alta (fire-and-forget desde el cliente).
//   • El botón "Re-procesar proyecto" de la ficha (síncrono, espera el
//     resultado para mostrarlo al usuario).
//
// Es idempotente: una segunda ejecución solo hace lo que falte. Si el tope de
// gasto salta a mitad, lo hecho queda hecho y se devuelve en el resumen.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const estimate = await estimateBootstrapCost(id);
  return NextResponse.json(estimate);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  try {
    const result = await bootstrapProjectAnalysis(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al lanzar el análisis";
    // El bootstrap lanza Error si el proyecto no tiene dominio; los topes de
    // gasto y los errores de DataForSEO ya se capturan dentro y se devuelven
    // en `errors[]`, no llegan aquí.
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
