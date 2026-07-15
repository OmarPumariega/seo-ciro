-- CreateTable
CREATE TABLE "GscSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "rangeDays" INTEGER NOT NULL,
    "totals" JSONB NOT NULL,
    "topQueries" JSONB,
    "topPages" JSONB,
    "byDevice" JSONB,
    "byCountry" JSONB,
    "monthly" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GscSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GscSnapshot_projectId_createdAt_idx" ON "GscSnapshot"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GscSnapshot_projectId_month_key" ON "GscSnapshot"("projectId", "month");

-- AddForeignKey
ALTER TABLE "GscSnapshot" ADD CONSTRAINT "GscSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
