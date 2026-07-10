-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ga4PropertyId" TEXT,
ADD COLUMN     "gscSiteUrl" TEXT;

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "googleEmail" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);
