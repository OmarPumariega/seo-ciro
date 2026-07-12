-- AlterTable
ALTER TABLE "ContentGeneration" ADD COLUMN     "internalLinks" TEXT;

-- AlterTable
ALTER TABLE "KeywordStudy" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "reportConfig" JSONB;

-- AlterTable
ALTER TABLE "TodoItem" ADD COLUMN     "detail" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'media',
ADD COLUMN     "title" TEXT;
