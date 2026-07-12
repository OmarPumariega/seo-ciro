-- AlterTable
ALTER TABLE "TodoItem" ADD COLUMN     "affectedUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "issueType" TEXT;
