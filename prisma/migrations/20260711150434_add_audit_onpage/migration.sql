-- AlterTable
ALTER TABLE "AuditPage" ADD COLUMN     "h1Count" INTEGER,
ADD COLUMN     "h1Text" TEXT,
ADD COLUMN     "isRedirect" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metaDescription" TEXT,
ADD COLUMN     "metaLength" INTEGER,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "titleLength" INTEGER;
