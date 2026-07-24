-- CreateTable
CREATE TABLE "BacklinkSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "rank" INTEGER,
    "backlinksTotal" INTEGER,
    "referringDomains" INTEGER,
    "referringMainDomains" INTEGER,
    "dofollowBacklinks" INTEGER,
    "nofollowBacklinks" INTEGER,
    "brokenBacklinks" INTEGER,
    "topBacklinks" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacklinkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacklinkSnapshot_projectId_domain_fetchedAt_idx" ON "BacklinkSnapshot"("projectId", "domain", "fetchedAt");

-- AddForeignKey
ALTER TABLE "BacklinkSnapshot" ADD CONSTRAINT "BacklinkSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
