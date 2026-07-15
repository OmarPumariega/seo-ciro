import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { DataForSeoSpendLimitError } from "@/lib/dataforseo/spend";
import { checkRankKeyword } from "@/lib/rank/check";

// "Comprobar ahora": chequeo SÍCRONO (a diferencia del patrón async del
// Módulo 8, una sola llamada SERP tarda ~3s, no cientos de páginas como un
// crawl). Devuelve la posición actualizada al momento.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; kwId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, kwId } = await params;
  const existing = await prisma.rankKeyword.findUnique({ where: { id: kwId } });
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Keyword no encontrada" }, { status: 404 });
  }

  try {
    const result = await checkRankKeyword(kwId);
    const updated = await prisma.rankKeyword.findUnique({ where: { id: kwId } });

    // Fire-and-forget: aprovecha el SERP ya pagado para alimentar el TF-IDF
    // automáticamente (scraping del top-10 + cálculo + persistencia). No
    // bloquea la respuesta — corre en background.
    if (result.projectId) {
      import("@/lib/tfidf/auto")
        .then(({ autoRunTfidf }) =>
          autoRunTfidf({
            projectId: result.projectId,
            keyword: result.keyword,
            locationCode: result.locationCode,
            languageCode: result.languageCode,
            device: result.device,
          })
        )
        .catch((e) => console.error("[tfidf-auto] fire-and-forget:", e));
    }

    return NextResponse.json({ position: result.position, keyword: updated });
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : "Error al comprobar la posición";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
