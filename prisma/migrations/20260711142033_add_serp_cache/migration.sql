-- CreateTable
CREATE TABLE "SerpCache" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "locationCode" INTEGER NOT NULL,
    "languageCode" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerpCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SerpCache_keyword_locationCode_languageCode_device_idx" ON "SerpCache"("keyword", "locationCode", "languageCode", "device");

-- CreateIndex
CREATE UNIQUE INDEX "SerpCache_keyword_locationCode_languageCode_device_key" ON "SerpCache"("keyword", "locationCode", "languageCode", "device");
