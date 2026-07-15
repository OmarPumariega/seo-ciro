-- AlterTable
ALTER TABLE "TodoItem" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "TodoTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'media',
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TodoTemplate_pkey" PRIMARY KEY ("id")
);
