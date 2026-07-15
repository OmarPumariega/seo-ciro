-- CreateTable
CREATE TABLE "TfidfResult" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TfidfResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TfidfResult_projectId_createdAt_idx" ON "TfidfResult"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TfidfResult_projectId_keyword_key" ON "TfidfResult"("projectId", "keyword");

-- AddForeignKey
ALTER TABLE "TfidfResult" ADD CONSTRAINT "TfidfResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
