import { prisma } from "@/lib/db/prisma";
import { computePriorities } from "@/lib/keywords/priority";

// Recalcula la prioridad (0-100, cuota de volumen) de todas las keywords de un
// estudio y la persiste. Se llama después de añadir o quitar keywords: el
// volumen máximo del estudio puede cambiar, así que las prioridades relativas
// hay que recalcularlas todas para que sigan siendo coherentes.
export async function recomputeStudyPriorities(studyId: string): Promise<void> {
  const keywords = await prisma.keyword.findMany({ where: { studyId } });
  const priorities = computePriorities(
    keywords.map((k) => ({ keyword: k.keyword, searchVolume: k.searchVolume }))
  );
  await Promise.all(
    keywords.map((k) =>
      prisma.keyword.update({
        where: { id: k.id },
        data: { priority: priorities.get(k.keyword) ?? 0 },
      })
    )
  );
}
