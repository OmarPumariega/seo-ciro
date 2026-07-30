-- CreateTable
CREATE TABLE "OnPageAnalysis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "onPageScore" DOUBLE PRECISION,
    "wordCount" INTEGER,
    "characterCount" INTEGER,
    "sentenceCount" INTEGER,
    "titleLength" INTEGER,
    "descriptionLength" INTEGER,
    "htags" JSONB,
    "issues" JSONB,
    "readability" JSONB,
    "imagesCount" INTEGER,
    "internalLinksCount" INTEGER,
    "externalLinksCount" INTEGER,
    "hasBrokenLinks" BOOLEAN,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnPageAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnPageAnalysis_projectId_url_fetchedAt_idx" ON "OnPageAnalysis"("projectId", "url", "fetchedAt");

-- AddForeignKey
ALTER TABLE "OnPageAnalysis" ADD CONSTRAINT "OnPageAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
