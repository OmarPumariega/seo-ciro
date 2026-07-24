-- AlterTable
ALTER TABLE "SerpCache" ADD COLUMN     "featuredSnippet" JSONB,
ADD COLUMN     "peopleAlsoAsk" JSONB,
ADD COLUMN     "relatedSearches" JSONB;
