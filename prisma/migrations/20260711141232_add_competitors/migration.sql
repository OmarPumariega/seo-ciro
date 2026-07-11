-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "contentGap" JSONB,
    "contentGapAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisibilitySnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "organicTraffic" DOUBLE PRECISION,
    "organicKeywords" INTEGER,
    "topKeywords" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisibilitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competitor_projectId_idx" ON "Competitor"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_projectId_domain_key" ON "Competitor"("projectId", "domain");

-- CreateIndex
CREATE INDEX "VisibilitySnapshot_projectId_domain_fetchedAt_idx" ON "VisibilitySnapshot"("projectId", "domain", "fetchedAt");

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisibilitySnapshot" ADD CONSTRAINT "VisibilitySnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
