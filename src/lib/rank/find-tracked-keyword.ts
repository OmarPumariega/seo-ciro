import { prisma } from "@/lib/db/prisma";
import { normalizeUrl } from "@/lib/seo/normalize-url";

// Busca si una URL del proyecto ya está posicionando para alguna keyword en
// seguimiento (Módulo 5) — mira la RankPosition más reciente de cada
// RankKeyword del proyecto y compara la URL que posicionó. Usado por
// Contenido → "Optimizar URL existente" para autosugerir la keyword
// objetivo de una URL ya publicada (el usuario puede sobrescribirla).
export type TrackedKeywordMatch = {
  keyword: string;
  lastPosition: number | null;
  bestPosition: number | null;
  locationCode: number;
  languageCode: string;
};

export async function findTrackedKeywordForUrl(
  projectId: string,
  url: string
): Promise<TrackedKeywordMatch | null> {
  const target = normalizeUrl(url);
  if (!target) return null;

  const latestPositions = await prisma.rankPosition.findMany({
    where: { rankKeyword: { projectId }, url: { not: null } },
    orderBy: { checkedAt: "desc" },
    distinct: ["rankKeywordId"],
    select: {
      url: true,
      position: true,
      rankKeyword: { select: { keyword: true, bestPosition: true, locationCode: true, languageCode: true } },
    },
  });

  const match = latestPositions.find((p) => p.url && normalizeUrl(p.url) === target);
  if (!match) return null;

  return {
    keyword: match.rankKeyword.keyword,
    lastPosition: match.position,
    bestPosition: match.rankKeyword.bestPosition,
    locationCode: match.rankKeyword.locationCode,
    languageCode: match.rankKeyword.languageCode,
  };
}
