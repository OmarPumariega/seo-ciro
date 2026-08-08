-- AlterTable
ALTER TABLE "ProjectNote" ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "ProjectNoteImage" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filename" TEXT,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNoteImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectNoteImage_noteId_idx" ON "ProjectNoteImage"("noteId");

-- AddForeignKey
ALTER TABLE "ProjectNoteImage" ADD CONSTRAINT "ProjectNoteImage_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ProjectNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
