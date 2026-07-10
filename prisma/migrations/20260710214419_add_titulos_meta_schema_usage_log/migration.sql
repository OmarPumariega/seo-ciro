-- CreateTable
CREATE TABLE "TitleMetaGeneration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "keyword" TEXT,
    "variants" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TitleMetaGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchemaGeneration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "suggestedType" TEXT NOT NULL,
    "selectedType" TEXT NOT NULL,
    "jsonLd" JSONB NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "validationErrors" JSONB,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemaGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "api" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "costUsd" DECIMAL(10,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TitleMetaGeneration_projectId_createdAt_idx" ON "TitleMetaGeneration"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "SchemaGeneration_projectId_createdAt_idx" ON "SchemaGeneration"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiUsageLog_projectId_createdAt_idx" ON "ApiUsageLog"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "TitleMetaGeneration" ADD CONSTRAINT "TitleMetaGeneration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemaGeneration" ADD CONSTRAINT "SchemaGeneration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsageLog" ADD CONSTRAINT "ApiUsageLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
