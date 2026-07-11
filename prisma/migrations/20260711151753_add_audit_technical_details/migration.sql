-- AlterTable
ALTER TABLE "AuditPage" ADD COLUMN     "externalDomains" JSONB,
ADD COLUMN     "externalLinksCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AuditRun" ADD COLUMN     "robotsContent" TEXT,
ADD COLUMN     "sitemapUrlCount" INTEGER,
ADD COLUMN     "sitemapUrls" JSONB;
