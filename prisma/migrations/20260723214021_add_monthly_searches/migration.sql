-- AlterTable
ALTER TABLE "Keyword" ADD COLUMN     "monthlySearches" JSONB;

-- AlterTable
ALTER TABLE "KeywordDataCache" ADD COLUMN     "monthlySearches" JSONB;
