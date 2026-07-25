
-- CreateTable
CREATE TABLE "UrlOptimization" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "targetKeyword" TEXT NOT NULL,
    "currentSnapshot" JSONB NOT NULL,
    "rankPosition" INTEGER,
    "suggestions" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrlOptimization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UrlOptimization_projectId_url_createdAt_idx" ON "UrlOptimization"("projectId", "url", "createdAt");

-- AddForeignKey
ALTER TABLE "UrlOptimization" ADD CONSTRAINT "UrlOptimization_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

