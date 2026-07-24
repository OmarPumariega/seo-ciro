-- AlterTable
ALTER TABLE "AuditPage" ADD COLUMN     "hasOpenGraph" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasStructuredData" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hreflangCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "structuredDataTypes" JSONB,
ADD COLUMN     "xRobotsTag" TEXT;
