-- CreateTable
CREATE TABLE "BootstrapRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "result" JSONB,
    "errorMessage" TEXT,

    CONSTRAINT "BootstrapRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BootstrapRun_projectId_triggeredAt_idx" ON "BootstrapRun"("projectId", "triggeredAt");

-- AddForeignKey
ALTER TABLE "BootstrapRun" ADD CONSTRAINT "BootstrapRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
