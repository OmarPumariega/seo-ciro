-- CreateTable
CREATE TABLE "RankKeyword" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "locationCode" INTEGER NOT NULL DEFAULT 2724,
    "languageCode" TEXT NOT NULL DEFAULT 'es',
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "lastPosition" INTEGER,
    "bestPosition" INTEGER,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankPosition" (
    "id" TEXT NOT NULL,
    "rankKeywordId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER,
    "url" TEXT,

    CONSTRAINT "RankPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RankKeyword_projectId_idx" ON "RankKeyword"("projectId");

-- CreateIndex
CREATE INDEX "RankKeyword_lastCheckedAt_idx" ON "RankKeyword"("lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RankKeyword_projectId_keyword_locationCode_languageCode_dev_key" ON "RankKeyword"("projectId", "keyword", "locationCode", "languageCode", "device");

-- CreateIndex
CREATE INDEX "RankPosition_rankKeywordId_checkedAt_idx" ON "RankPosition"("rankKeywordId", "checkedAt");

-- AddForeignKey
ALTER TABLE "RankKeyword" ADD CONSTRAINT "RankKeyword_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankPosition" ADD CONSTRAINT "RankPosition_rankKeywordId_fkey" FOREIGN KEY ("rankKeywordId") REFERENCES "RankKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
