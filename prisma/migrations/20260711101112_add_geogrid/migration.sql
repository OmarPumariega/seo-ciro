-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "GeogridRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "gridSize" INTEGER NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "zoom" INTEGER NOT NULL DEFAULT 15,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "points" JSONB,
    "averagePosition" DOUBLE PRECISION,
    "foundCount" INTEGER,
    "errorMessage" TEXT,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GeogridRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeogridRun_projectId_triggeredAt_idx" ON "GeogridRun"("projectId", "triggeredAt");

-- AddForeignKey
ALTER TABLE "GeogridRun" ADD CONSTRAINT "GeogridRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
