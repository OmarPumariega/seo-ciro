-- AlterTable
ALTER TABLE "AuditPage" ADD COLUMN     "wordCount" INTEGER;

-- AlterTable
ALTER TABLE "AuditRun" ADD COLUMN     "linkGraph" JSONB;

-- CreateTable
CREATE TABLE "CopilotThread" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotThread_projectId_updatedAt_idx" ON "CopilotThread"("projectId", "updatedAt");

-- AddForeignKey
ALTER TABLE "CopilotThread" ADD CONSTRAINT "CopilotThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
