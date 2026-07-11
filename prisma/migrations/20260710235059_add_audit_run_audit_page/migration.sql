-- CreateTable
CREATE TABLE "AuditRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startUrl" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
    "sitemapFound" BOOLEAN,
    "robotsBlocked" BOOLEAN NOT NULL DEFAULT false,
    "overallScore" INTEGER,
    "categoryScores" JSONB,
    "psiData" JSONB,
    "gscChecked" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,

    CONSTRAINT "AuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPage" (
    "id" TEXT NOT NULL,
    "auditRunId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER,
    "isHttps" BOOLEAN NOT NULL,
    "canonicalUrl" TEXT,
    "metaRobots" TEXT,
    "imagesTotal" INTEGER NOT NULL DEFAULT 0,
    "imagesMissingAlt" INTEGER NOT NULL DEFAULT 0,
    "brokenLinksCount" INTEGER NOT NULL DEFAULT 0,
    "brokenLinksSample" JSONB,
    "inSearchConsole" BOOLEAN,
    "issues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditRun_projectId_triggeredAt_idx" ON "AuditRun"("projectId", "triggeredAt");

-- CreateIndex
CREATE INDEX "AuditPage_auditRunId_idx" ON "AuditPage"("auditRunId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPage_auditRunId_url_key" ON "AuditPage"("auditRunId", "url");

-- AddForeignKey
ALTER TABLE "AuditRun" ADD CONSTRAINT "AuditRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPage" ADD CONSTRAINT "AuditPage_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
