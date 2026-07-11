-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "rankLastDequeuedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ApiUsageLog_api_createdAt_idx" ON "ApiUsageLog"("api", "createdAt");
