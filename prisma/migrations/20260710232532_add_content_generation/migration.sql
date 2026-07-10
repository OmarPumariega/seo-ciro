-- CreateTable
CREATE TABLE "ContentGeneration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "keyword" TEXT,
    "targetUrl" TEXT,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentGeneration_projectId_createdAt_idx" ON "ContentGeneration"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContentGeneration" ADD CONSTRAINT "ContentGeneration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
