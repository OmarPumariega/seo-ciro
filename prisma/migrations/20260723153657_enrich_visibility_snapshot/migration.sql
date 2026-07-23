-- AlterTable
ALTER TABLE "GlobalSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VisibilitySnapshot" ADD COLUMN     "avgPosition" DOUBLE PRECISION,
ADD COLUMN     "positionBuckets" JSONB;
