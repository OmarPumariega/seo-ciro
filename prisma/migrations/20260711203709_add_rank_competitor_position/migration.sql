-- CreateTable
CREATE TABLE "RankCompetitorPosition" (
    "id" TEXT NOT NULL,
    "rankKeywordId" TEXT NOT NULL,
    "competitorDomain" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER,
    "url" TEXT,

    CONSTRAINT "RankCompetitorPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RankCompetitorPosition_rankKeywordId_competitorDomain_check_idx" ON "RankCompetitorPosition"("rankKeywordId", "competitorDomain", "checkedAt");

-- AddForeignKey
ALTER TABLE "RankCompetitorPosition" ADD CONSTRAINT "RankCompetitorPosition_rankKeywordId_fkey" FOREIGN KEY ("rankKeywordId") REFERENCES "RankKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
