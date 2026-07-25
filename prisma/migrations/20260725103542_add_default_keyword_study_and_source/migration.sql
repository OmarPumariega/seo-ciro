
-- AlterTable
ALTER TABLE "Keyword" ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "defaultKeywordStudyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_defaultKeywordStudyId_key" ON "Project"("defaultKeywordStudyId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultKeywordStudyId_fkey" FOREIGN KEY ("defaultKeywordStudyId") REFERENCES "KeywordStudy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

