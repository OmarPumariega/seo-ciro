-- CreateTable
CREATE TABLE "KeywordStudy" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'es',
    "locationCode" INTEGER NOT NULL DEFAULT 2724,
    "structure" JSONB,
    "structureModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordStudy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "searchVolume" INTEGER,
    "competition" TEXT,
    "cpc" DECIMAL(10,2),
    "intent" TEXT,
    "priority" INTEGER NOT NULL,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordDataCache" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "locationCode" INTEGER NOT NULL,
    "searchVolume" INTEGER,
    "competition" TEXT,
    "cpc" DECIMAL(10,2),
    "intent" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordDataCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeywordStudy_projectId_createdAt_idx" ON "KeywordStudy"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Keyword_studyId_priority_idx" ON "Keyword"("studyId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_studyId_keyword_key" ON "Keyword"("studyId", "keyword");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordDataCache_keyword_languageCode_locationCode_key" ON "KeywordDataCache"("keyword", "languageCode", "locationCode");

-- AddForeignKey
ALTER TABLE "KeywordStudy" ADD CONSTRAINT "KeywordStudy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "KeywordStudy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
