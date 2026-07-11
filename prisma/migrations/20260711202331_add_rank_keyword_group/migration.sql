-- AlterTable
ALTER TABLE "RankKeyword" ADD COLUMN     "group" TEXT;

-- CreateIndex
CREATE INDEX "RankKeyword_projectId_group_idx" ON "RankKeyword"("projectId", "group");
