-- CreateTable
CREATE TABLE "Ga4Snapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "rangeDays" INTEGER NOT NULL,
    "totals" JSONB NOT NULL,
    "byChannel" JSONB,
    "topLandingPages" JSONB,
    "byDevice" JSONB,
    "monthly" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ga4Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ga4Snapshot_projectId_createdAt_idx" ON "Ga4Snapshot"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ga4Snapshot_projectId_month_key" ON "Ga4Snapshot"("projectId", "month");

-- AddForeignKey
ALTER TABLE "Ga4Snapshot" ADD CONSTRAINT "Ga4Snapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
